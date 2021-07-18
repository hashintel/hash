import { FormEvent, useState, VoidFunctionComponent } from "react";
import { useCreatePage } from "../../hooks/useCreatePage";
import { Modal } from "../Modal";

import styles from "./CreatePage.module.scss";

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
    });
  };

  return (
    <Modal show={show} close={close}>
      <form className={styles.CreatePage} onSubmit={createPage}>
        <h2>Don't be afraid of a blank page...</h2>

        <label>Title</label>
        <input
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this document?"
          required
          type="text"
          value={title}
        />

        <button className="button big" type="submit">
          Create
        </button>
      </form>
    </Modal>
  );
};
