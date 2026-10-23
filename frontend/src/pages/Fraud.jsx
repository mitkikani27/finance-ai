import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Fraud() {
  const nav = useNavigate();
  useEffect(() => {
    nav("/", { replace: true });
  }, [nav]);
  return null;
}
