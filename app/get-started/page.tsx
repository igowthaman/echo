"use client";
import { Grid2, Typography } from "@mui/material";
import React, { useState } from "react";
import { useAuthState } from "../lib/auth";
import { redirect } from "next/navigation";

function GetStarted() {
  const [value, setValue] = useState("");
  const { userName, setUserName } = useAuthState();

  if (userName) redirect("/");
  return (
    <Grid2 container>
      <Grid2
        size={{ xs: 11, sm: 10, md: 6, lg: 4, xl: 2 }}
        margin="auto"
        marginTop={"40px"}
        textAlign={"center"}
        bgcolor={"white"}
        color={"black"}
      >
        <div>
          <Typography>Echo</Typography>
          <div>
            <input
              value={value}
              placeholder="Username"
              onChange={(event) => {
                setValue(event.target.value);
              }}
            ></input>
          </div>
          <button
            onClick={() => {
              setUserName(value);
            }}
          >
            Create
          </button>
        </div>
      </Grid2>
    </Grid2>
  );
}

export default GetStarted;
