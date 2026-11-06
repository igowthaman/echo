"use client";
import React, { useState } from "react";
import { useAuthState } from "../lib/auth";
import { redirect } from "next/navigation";

function GetStarted() {
  const [value, setValue] = useState("");
  const { userName, setUserName } = useAuthState();

  if (userName) redirect("/");
  return (
    <div >
      <div
        
      >
        <div>
          <h1>Echo</h1>
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
      </div>
    </div>
  );
}

export default GetStarted;
