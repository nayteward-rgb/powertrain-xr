"use client";

import dynamic from "next/dynamic";

const MotorFloorClient = dynamic(() => import("./MotorFloorClient"), {
  ssr: false,
  loading: () => (
    <main className="launch-shell">
      <p>Loading the 3D synchronous motor floor…</p>
      <a className="open-full-page" href="/simulator-v5.html?v=6">
        Open the 2D simulator while the motor floor loads
      </a>
    </main>
  ),
});

export default function MotorFloorVRPage() {
  return <MotorFloorClient />;
}
