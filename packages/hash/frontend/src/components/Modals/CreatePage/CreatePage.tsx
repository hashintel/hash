import { FormEvent, useState, VoidFunctionComponent } from "react";
import { useCreatePage } from "../../hooks/useCreatePage";
import { Modal } from "../Modal";

import styles from "./CreatePage.module.scss";
import { Button } from "../../forms/Button";

type CreatePageProps = {
  close: () => void;
  accountId: string;
  show: boolean;
};

export const CreatePage: VoidFunctionComponent<CreatePageProps> = ({
  close,
  accountId,
  show,
}) => {
  const [title, setTitle] = useState("");

  const { create } = useCreatePage();

  const createPage = (event: FormEvent) => {
    event.preventDefault();
    create({
      variables: { accountId, properties: { title } },
    }).catch((err) => console.error("Could not create page: ", err));
  };

  return (
    <Modal show={show} close={close}>
      <form className={styles.CreatePage} onSubmit={createPage}>
        <h2>Don't be afraid of a blank page...</h2>

        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label>Title</label>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What is this document?"
          required
          type="text"
          value={title}
        />

        <Button big type="submit">
          Create
        </Button>
      </form>
    </Modal>
  );
};
