"use client";
import React, { useEffect, useRef, useState } from "react";
import { Peer } from "peerjs";
import { useAuthState } from "./lib/auth";
import { redirect } from "next/navigation";

export default function Home() {
  const { userName } = useAuthState();

  console.log("********* userName", userName);

  const [username2, setUsername2] = useState<string>("");
  const peerRef = useRef<null | Peer>(null);

  const [peersList, setPeersList] = useState([]);

  const createUser = () => {
    peerRef.current = new Peer(userName, {
      host: "/",
      port: 3000,
      path: "/peerjs/api",
    });
    peerRef.current.on("open", function (id) {
      console.log("My peer ID is: " + id);
    });
    peerRef.current.on("connection", function (data) {
      console.log("My peer is connected with data", data);
      setPeersList([...peersList, data.peer]);
    });
    peerRef.current.on("call", function (data) {
      console.log("My peer is called with data", data);
    });
    peerRef.current.on("close", function () {
      console.log("My peer is closed ");
    });
    peerRef.current.on("disconnected", function () {
      console.log("My peer is disconnected");
    });
    peerRef.current.on("error", function (error) {
      console.log("My peer gives error: " + error);
      alert(error);
    });
  };

  useEffect(() => {
    if (userName) createUser();
    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const createConnection = () => {
    const newPeer = peerRef.current.connect(username2);
    newPeer.on("open", () => {
      console.log("********* successful", peerRef.current.connections);
      setPeersList([...peersList, username2]);

      newPeer.on("data", (data) => {
        console.log("***********", data);
      });

      newPeer.on("close", () => {
        console.log("********* closed");
      });
    });
    newPeer.on("error", (error) => {
      console.log("********* error", error);
    });
  };

  if (!userName) redirect("/get-started");

  return (
    <div>
      <h1>Hi, {userName}</h1>
      <input
        value={username2}
        placeholder="Username"
        onChange={(event) => {
          setUsername2(event.target.value);
        }}
      />
      <button onClick={createConnection}>Connect</button>
      <h1>Peers</h1>
      <div>
        {peersList.map((peer) => {
          return <p key={peer}>{peer}</p>;
        })}
      </div>
    </div>
  );
}
