/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { CacheStatus } from "./cache-status"
import { CacheView } from "./cache-view"
import { createSpeedTracker } from "./metrics/speed"

const tui: TuiPlugin = async (api) => {
  const speed = createSpeedTracker(api)
  api.lifecycle.onDispose(speed.dispose)
  api.slots.register({
    order: 56,
    slots: {
      sidebar_content(ctx, props) {
        return (
          <CacheView
            api={api}
            sessionID={props.session_id ?? ""}
            speed={speed}
            theme={ctx.theme.current}
          />
        )
      },
      session_prompt_right(ctx, props) {
        return (
          <CacheStatus
            api={api}
            sessionID={props.session_id}
            speed={speed}
            theme={ctx.theme.current}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-cache-view",
  tui,
}

export default plugin
