import React from "react";
import Button from "@mui/material/Button";
import moment from "moment";

const MyButton = () => {
  const currentTime = moment().format("MMMM Do YYYY, h:mm:ss a");
  return (
    <Button variant="contained" color="primary" sx={{ backgroundColor: "red" }}>
      {currentTime}
    </Button>
  );
};

export default MyButton;
