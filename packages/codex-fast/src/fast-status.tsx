/** @jsxImportSource @opentui/solid */

import type { Accessor } from "solid-js";

export function FastStatus(props: {
  enabled: Accessor<boolean>;
  providerID: Accessor<string | undefined>;
}) {
  return (
    <box visible={props.providerID() === "openai"} paddingRight={1}>
      <text>
        <span>{props.enabled() ? "⚡" : "🐢"}</span>
      </text>
    </box>
  );
}
