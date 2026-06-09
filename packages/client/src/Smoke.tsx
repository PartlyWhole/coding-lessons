import { useState } from "react";

export function Smoke(): React.ReactElement {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((x) => x + 1)}>
      count: {n}
    </button>
  );
}
