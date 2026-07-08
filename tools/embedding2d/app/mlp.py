from logging import Logger
from os import PathLike

import numpy as np
import torch
from safetensors.torch import load_file, save_file
from torch import nn
from torch.optim import Adam
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm


def default_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class MLP(nn.Module):
    logger: Logger | None

    def __init__(self, *, input_dim: int, logger: Logger | None = None) -> None:
        super().__init__()
        self.logger = logger
        self.layers = nn.Sequential(
            nn.Flatten(),
            nn.Linear(input_dim, 512),
            nn.ReLU(),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Linear(512, 2),
        )

    def forward(self, x):
        return self.layers(x)

    def fit(
        self,
        xs: np.ndarray,
        ys: np.ndarray,
        *,
        epochs: int = 30,
        batch_size: int = 8192,
        lr: float = 1e-3,
        lr_min: float = 1e-4,
        val_frac: float = 0.02,
        seed: int = 0,
        patience: int = 5,
    ) -> float:
        assert xs.dtype == np.float32, f"xs must be float32 got {xs.dtype}"
        assert ys.dtype == np.float32, f"ys must be float32 got {ys.dtype}"

        device = default_device()
        self.to(device)
        if self.logger:
            self.logger.info(f"training on {device}")

        # Prepare the dataset. `xs` is typically a large read-only
        # memmap, so it's never turned into one big tensor; instead each
        # batch is gathered from numpy below (fancy-indexing a memmap
        # copies just the requested rows into memory).
        generator = torch.Generator().manual_seed(seed)

        # Split into training and validation sets, given the generator that's been seeded from the provided seed
        n = len(xs)
        n_val = int(n * val_frac)
        # ... to do so, we first generate a permutation of `0..n` which is randomized
        perm = torch.randperm(n, generator=generator)
        # ... each index is then split into either the validation or training set.
        val_idx, train_idx = perm[:n_val], perm[n_val:]
        # ... x_val is therefore then the values that `val_index` has chosen
        x_val = torch.from_numpy(xs[val_idx.numpy()]).to(device)
        y_val = torch.from_numpy(ys[val_idx.numpy()]).to(device)

        # The steps per epoch is the number of batches needed to cover the training set
        steps_per_epoch = (len(train_idx) + batch_size - 1) // batch_size
        optimizer = Adam(self.parameters(), lr=lr)
        schedule = CosineAnnealingLR(
            optimizer, T_max=epochs * steps_per_epoch, eta_min=lr_min
        )

        val_rmse = float("nan")
        best_rmse = float("inf")
        best_state = None
        bad = 0

        epoch_bar = tqdm(range(epochs), desc="distilling", unit="epoch")
        for epoch in epoch_bar:
            self.train()

            # Create a new random permutation of the training indices for this epoch, basically shuffling them
            order = train_idx[torch.randperm(len(train_idx), generator=generator)]

            # Loop over the randomized order, in the batch size configured
            # We loop over the entire training set every epoch, but randomize the order, so that
            # the model does not get dependent on the order of the training data.
            for start in range(0, len(order), batch_size):
                idx = order[start : start + batch_size].numpy()
                x = torch.from_numpy(xs[idx]).to(device)
                y = torch.from_numpy(ys[idx]).to(device)

                optimizer.zero_grad()
                loss = nn.functional.mse_loss(self(x), y)
                loss.backward()
                optimizer.step()
                schedule.step()

            if n_val:
                self.eval()

                # no-grad here means that we disable autograd graph construction
                with torch.no_grad():
                    val_rmse = nn.functional.mse_loss(self(x_val), y_val).sqrt().item()

                epoch_bar.set_postfix(
                    val_rmse=f"{val_rmse:.5f}", best=f"{best_rmse:.5f}"
                )

                # Check if the validation RMSE is better than the best so far
                if val_rmse < best_rmse - 1e-4:
                    best_rmse, bad = val_rmse, 0
                    best_state = {
                        k: v.detach().clone() for k, v in self.state_dict().items()
                    }
                else:
                    # if it isn't, try for `patience` epochs, maybe we actually descent further
                    bad += 1
                    if bad >= patience:
                        # if we've tried for `patience` epochs and the RMSE hasn't improved, stop early
                        # and adopt the best state we've seen so far
                        epoch_bar.set_description("distilling (early stop)")
                        break

        if best_state is not None:
            self.load_state_dict(best_state)
            return best_rmse

        return val_rmse

    def export(
        self,
        path: PathLike,
        *,
        scale: np.ndarray,
        center: np.ndarray,
        meta: dict[str, str] | None = None,
    ):
        linears = [module for module in self.layers if isinstance(module, nn.Linear)]
        tensors: dict[str, torch.Tensor] = {}

        s = torch.from_numpy(scale.astype(np.float32))
        c = torch.from_numpy(center.astype(np.float32))

        for index, linear in enumerate(linears, start=1):
            w = linear.weight.detach().cpu().clone()
            b = linear.bias.detach().cpu().clone()

            # The network is trained on standardized coordinates; fold
            # the de-standardization (y * scale + center) into the last
            # layer so consumers get layout units without extra steps:
            # (Wx + b) * s + c == (s * W)x + (b * s + c)
            if index == len(linears):
                w *= s[:, None]
                b = b * s + c

            tensors[f"w{index}"] = w.contiguous()
            tensors[f"b{index}"] = b.contiguous()

        # Stored so import_ can unfold the last layer again; consumers
        # of the encoder only need w*/b* and can ignore these.
        tensors["scale"] = s.contiguous()
        tensors["center"] = c.contiguous()

        save_file(tensors, path, metadata={"act": "relu", **(meta or {})})

    def import_(self, path: PathLike):
        linears = [module for module in self.layers if isinstance(module, nn.Linear)]
        tensors = load_file(path)

        # Validate and unfold everything *before* touching the network,
        # so an incompatible file leaves it untouched rather than
        # half-loaded.
        try:
            scale, center = tensors["scale"], tensors["center"]

            staged: list[tuple[nn.Linear, torch.Tensor, torch.Tensor]] = []
            for index, linear in enumerate(linears, start=1):
                w = tensors[f"w{index}"]
                b = tensors[f"b{index}"]

                # export folds the de-standardization into the last
                # layer (see there); undo it, since fit trains against
                # standardized coordinates again.
                if index == len(linears):
                    w = w / scale[:, None]
                    b = (b - center) / scale

                if w.shape != linear.weight.shape or b.shape != linear.bias.shape:
                    raise ValueError(
                        f"shape mismatch: w{index}={w.shape} b{index}={b.shape}"
                    )

                staged.append((linear, w, b))
        except (KeyError, ValueError) as exc:
            if self.logger:
                self.logger.error(
                    f"previous encoder is incompatible ({exc}); training from scratch"
                )
            return

        for linear, w, b in staged:
            linear.weight.data.copy_(w)
            linear.bias.data.copy_(b)

        if self.logger:
            self.logger.info("fine-tuning from previous encoder")
