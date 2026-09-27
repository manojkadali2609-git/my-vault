"use client";
import { useEffect } from "react";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("My VaulT error:", error); }, [error]);
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}><section style={{textAlign:"center",maxWidth:520}}><h1>Something went wrong</h1><p>Please try again.</p><button type="button" onClick={reset}>Try again</button></section></main>;
}
