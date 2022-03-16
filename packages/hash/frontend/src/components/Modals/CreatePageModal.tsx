import { FormEvent, useEffect, useState, VoidFunctionComponent } from "react";
import { Router, useRouter } from "next/router";
import { Box, Typography } from "@mui/material";

import { useCreatePage } from "../hooks/useCreatePage";
import { Modal } from "./Modal";

import { Button } from "../Button";

type CreatePageModalProps = {
  accountId: string;
  close: () => void;
  show: boolean;
};

export const CreatePageModal: VoidFunctionComponent<CreatePageModalProps> = ({
  close,
  accountId,
  show,
}) => {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { create } = useCreatePage();

  const createPage = (event: FormEvent) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    create({
      variables: { accountId, properties: { title } },
    })
      .then((response) => {
        const { accountId: pageAccountId, entityId: pageEntityId } =
          response.data?.createPage ?? {};

        if (pageAccountId && pageEntityId) {
          return router.push(`/${pageAccountId}/${pageEntityId}`);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error("Could not create page: ", err);
        setLoading(false);
        close();
      });
  };

  useEffect(() => {
    const routeChangeHandler = () => {
      setLoading(false);
      close();
    };

    Router.events.on("routeChangeComplete", routeChangeHandler);

    return () => Router.events.off("routeChangeComplete", routeChangeHandler);
  }, [close]);

  return (
    <Modal data-testid="create-page-modal" open={show} onClose={close}>
      <Box
        component="form"
        sx={{
          "& input": {
            padding: "12px 20px",
            borderRadius: "4px",
            border: "1px solid lightgray",
            fontSize: 16,
            mb: "30px",
            width: "100%",
          },
        }}
        onSubmit={createPage}
      >
        <Typography component="h2" variant="h4" mb="30px">
          Don't be afraid of a blank page...
        </Typography>

        <Typography display="block" component="label" fontWeight={600} mb="8px">
          Title
        </Typography>

        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this document?"
          required
          type="text"
          value={title}
        />

        <Button disabled={loading} type="submit">
          Create
        </Button>
      </Box>
    </Modal>
  );
};
