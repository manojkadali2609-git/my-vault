"use client";

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          console.log("My VaulT service worker registered");
        })
        .catch((error) => {
          console.error("My VaulT service worker registration failed:", error);
        });
    }
  }, []);

  return null;
}