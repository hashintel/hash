import DeleteIcon from "@mui/icons-material/Delete";
import LanguageIcon from "@mui/icons-material/Language";
import LinkIcon from "@mui/icons-material/LinkOutlined";
import { Box } from "@mui/material";
import { FormEvent, FunctionComponent, useRef, useState } from "react";

import { isValidLink } from "./util";

type LinkModalProps = {
  savedLinkMarkHref?: string;
  updateLink: (href: string) => void;
  removeLink: () => void;
};

export const LinkModal: FunctionComponent<LinkModalProps> = ({
  savedLinkMarkHref,
  updateLink,
  removeLink,
}) => {
  const [newLinkHref, setNewLinkHref] = useState("");
  const linkModalRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateLink = (evt: FormEvent) => {
    evt.preventDefault();
    updateLink(newLinkHref);
  };

  const openUrl = () => {
    window.open(savedLinkMarkHref, "_blank");
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "0.375rem",
        // @todo use shadows from MUI theme https://app.asana.com/0/1203179076056209/1203480105875518/f
        boxShadow:
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        left: "50%",
        marginTop: "0.5rem",
        position: "absolute",
        transform: "translateX(-50%)",
        width: "20rem",
        zIndex: "10",
      }}
      ref={linkModalRef}
    >
      <form
        style={{
          display: "flex",
          paddingLeft: "1rem",
          paddingRight: "1rem",
          paddingBottom: "0.75rem",
          paddingTop: "1rem",
        }}
        onSubmit={handleUpdateLink}
      >
        <input
          style={{
            borderColor: "#D1D5DB",
            borderRadius: "0.125rem",
            borderStyle: "solid",
            display: "block",
            fontSize: "0.875rem",
            lineHeight: "1.25rem",
            outline: "0",
            paddingBottom: "0.25rem",
            paddingLeft: "0.5rem",
            paddingRight: "0.5rem",
            paddingTop: "0.25rem",
            width: "100%",
          }}
          type="text"
          onChange={(evt) => setNewLinkHref(evt.target.value)}
          value={newLinkHref}
          ref={linkInputRef}
          placeholder={savedLinkMarkHref ? "Edit link" : "Paste link"}
        />
      </form>

      <div style={{ color: "#374151" }}>
        {!savedLinkMarkHref && isValidLink(newLinkHref) && (
          <Box
            component="button"
            onClick={() => updateLink(newLinkHref)}
            type="button"
            sx={{
              alignItems: "center",
              backgroundColor: "#E5E7EB",
              color: "#374151",
              cursor: "pointer",
              display: "flex",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              marginBottom: "0.25rem",
              marginTop: "0.25rem",
              paddingBottom: "0.25rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
              paddingTop: "0.25rem",
              width: "100%",

              "&:hover": {
                backgroundColor: "#E5E7EB",
              },
            }}
          >
            <LinkIcon style={{ marginRight: "0.25rem" }} />
            <span>Add Link</span>
          </Box>
        )}
        {savedLinkMarkHref && (
          <>
            <div
              style={{
                fontSize: "0.75rem",
                lineHeight: "1rem",
              }}
            >
              <p
                style={{
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                }}
              >
                Linked To
              </p>
              {/* @todo discuss if this is better off as a link tag since that allows user to do extra
              stuff like "open in new window", "copy link" */}
              <Box
                component="button"
                sx={{
                  display: "flex",
                  paddingTop: "0.375rem",
                  paddingBottom: "0.375rem",
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                  backgroundColor: "transparent",
                  textAlign: "left",
                  width: "100%",
                  borderStyle: "none",
                  cursor: "pointer",

                  "&:hover": {
                    backgroundColor: "#E5E7EB",
                  },
                }}
                onClick={openUrl}
                type="button"
              >
                <LanguageIcon
                  style={{
                    marginRight: "0.25rem",
                  }}
                />
                <div>
                  <p
                    style={{
                      display: "-webkit-box",
                      fontSize: "0.875rem",
                      lineHeight: "1",
                      marginBottom: "0.125rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 4,
                      wordBreak: "break-all",
                    }}
                  >
                    {savedLinkMarkHref}
                  </p>
                  <span
                    style={{
                      fontWeight: "300",
                    }}
                  >
                    Web page
                  </span>
                </div>
              </Box>
            </div>
            <div
              style={{
                backgroundColor: "#F3F4F6",
                height: "1px",
              }}
            />
            <ul
              style={{
                fontSize: "0.875rem",
                lineHeight: "1.25rem",
                paddingBottom: "0.25rem",
                paddingTop: "0.25rem",
              }}
            >
              {isValidLink(newLinkHref) && (
                <li style={{ listStyle: "none" }}>
                  <Box
                    component="button"
                    sx={{
                      alignItems: "center",
                      backgroundColor: "transparent",
                      borderStyle: "none",
                      color: "#374151",
                      cursor: "pointer",
                      display: "flex",
                      fontSize: "0.875rem",
                      lineHeight: "1.25rem",
                      marginBottom: "0.25rem",
                      marginTop: "0.25rem",
                      paddingBottom: "0.25rem",
                      paddingLeft: "1rem",
                      paddingRight: "1rem",
                      paddingTop: "0.25rem",
                      width: "100%",

                      "&:hover": {
                        backgroundColor: "#E5E7EB",
                      },
                    }}
                    onClick={() => updateLink(newLinkHref)}
                    type="button"
                  >
                    <LinkIcon
                      style={{
                        marginRight: "0.25rem",
                      }}
                    />
                    <span>Update Link</span>
                  </Box>
                </li>
              )}
              <li style={{ listStyle: "none" }}>
                <Box
                  component="button"
                  sx={{
                    alignItems: "center",
                    backgroundColor: "transparent",
                    borderStyle: "none",
                    color: "#374151",
                    cursor: "pointer",
                    display: "flex",
                    paddingBottom: "0.25rem",
                    paddingLeft: "1rem",
                    paddingRight: "1rem",
                    paddingTop: "0.25rem",
                    width: "100%",

                    "&:hover": {
                      backgroundColor: "#E5E7EB",
                    },
                  }}
                  onClick={removeLink}
                  type="button"
                >
                  <DeleteIcon
                    style={{
                      marginRight: "0.25rem",
                      color: "#374151",
                    }}
                  />
                  <span>Remove link</span>
                </Box>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
