import { FormEvent, useEffect, useState, VoidFunctionComponent } from "react";
import { Router, useRouter } from "next/router";

import { useCreatePage } from "../../hooks/useCreatePage";
import { Modal } from "../Modal";

import styles from "./CreatePage.module.scss";
import { Button } from "../../forms/Button";

type CreatePageProps = {
  accountId: string;
  close: () => void;
  show: boolean;
};

export const CreatePage: VoidFunctionComponent<CreatePageProps> = ({
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
    <Modal show={show} close={close}>
      <form className={styles.CreatePage} onSubmit={createPage}>
        <h2>Don't be afraid of a blank page...</h2>

        <label>Title</label>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this document?"
          required
          type="text"
          value={title}
        />

        <Button disabled={loading} big type="submit">
          Create
        </Button>
      </form>
    </Modal>
  );
};
