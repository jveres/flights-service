// Copyright 2021 Janos Veres. All rights reserved.
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file.

// deno-lint-ignore-file no-explicit-any

import { Get, HttpServer, serve } from "https://deno.land/x/deco@0.6.1/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";
import { onSignal } from "https://deno.land/std@0.112.0/signal/mod.ts";
import { writeAll } from "https://deno.land/std@0.112.0/io/util.ts";

const PUBLISH_URI = "http://localhost:5561/publish";
const CHANNEL = "schedule";
const SCHEDULED_DEPARTURE_EVENT_NAME = "scheduled_departure";
const DAILY_SCHEDULE_EVENT_NAME = "daily_schedule";
const SCHEDULE_REFRESH_MS = 10000;
const PUSHPIN_BIN = Deno.env.get("PUSHPIN_BIN");

const pushpin = PUSHPIN_BIN ? Deno.run({ cmd: [PUSHPIN_BIN] }) : undefined;
const db = new DB("flights.db", { mode: "read" });

const columns = [
  "id",
  "year",
  "month",
  "day",
  "dep_time",
  "sched_dep_time",
  "dep_delay",
  "arr_time",
  "sched_arr_time",
  "arr_delay",
  "carrier",
  "flight",
  "tailnum",
  "origin",
  "dest",
  "air_time",
  "distance",
  "hour",
  "minute",
  "time_hour",
];

const print = (args: any) => {
  writeAll(Deno.stdout, new TextEncoder().encode(args));
};

const publish = async (content: any) => {
  const body = {
    "items": [
      {
        "channel": CHANNEL,
        "formats": {
          "http-stream": {
            "content": content,
          },
        },
      },
    ],
  };
  try {
    const res = await fetch(PUBLISH_URI, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
    print(res.status === 200 ? "✉️ " : "❌");
  } catch (_) {
    print("❌");
  }
};

@HttpServer()
class ServerController {
  private lastId: string | undefined;
  private today: number | undefined;
  private schedule = <any> [];

  constructor() {
    this.refreshSchedule();
  }

  getDailySchedule(
    lastId: string | undefined = undefined,
    logQuery = false,
    printHitTime = false,
  ) {
    const date = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (this.today !== undefined && this.today !== day) {
      print("🗓 ");
      this.schedule = [];
    }
    this.today = day;
    const time = `${Number(date.getHours()).toString().padStart(2, "0")}${
      Number(date.getMinutes()).toString().padStart(2, "0")
    }`;
    // deno-fmt-ignore
    const query = `select * from flights where month = ${Number(month).toString().padStart(2, "0")} and day = ${Number(day).toString().padStart(2, "0")} and sched_dep_time <= ${time}${lastId ? " and id > " + lastId : ""}`;
    if (logQuery) console.log(`sql> ${query}`);
    const res = db.query(query);
    if (printHitTime && res?.length > 0) {
      print(`⏱ ${time.substr(0, 2)}:${time.substr(2)} `);
    }
    return res?.map((row: any[]) => {
      const line = {} as { [key: string]: any };
      row.map((col: any, idx: number) => {
        line[columns[idx]] = col;
      });
      return line;
    });
  }

  refreshSchedule() {
    const prevLastId = this.lastId;
    const schedule = this.getDailySchedule(
      this.lastId,
      prevLastId === undefined,
      this.lastId !== undefined,
    );

    if (schedule.length > 0) this.lastId = schedule[schedule.length - 1]["id"];

    if (this.lastId !== prevLastId) {
      if (prevLastId !== undefined) {
        print(`${"✈️ ".repeat(schedule.length)} ${this.lastId} `);
        this.schedule = this.schedule.concat(schedule);
        schedule.map((sched: Record<string, any>) =>
          publish(
            this.sseEvent({
              id: sched.id,
              event: SCHEDULED_DEPARTURE_EVENT_NAME,
              data: sched,
            }),
          )
        );
      } else {
        this.schedule = schedule;
        print(`⏬ (${this.schedule.length}, ${this.lastId}) `);
      }
    } else {
      print("·");
    }
    setTimeout(() => {
      this.refreshSchedule();
    }, SCHEDULE_REFRESH_MS);
  }

  sseEvent(
    { id, event, data }: {
      id?: string;
      event: string;
      data: any;
    },
  ) {
    return `${id ? "id: " + id + "\n" : ""}event: ${event}\ndata: ${
      JSON.stringify(data)
    }\n\n\n`;
  }

  scheduleFromId(id: string): any[] {
    const lastId = parseInt(id);
    return this.schedule.filter((el: any) => {
      if (parseInt(el.id) >= lastId) return el;
    });
  }

  html() {
    const body = `
    <!DOCTYPE html>
      <html>
        <head>
          <title>Scheduled departure events test page</title>
          <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✈️</text></svg>">
          <script src="https://cdn.jsdelivr.net/npm/reconnecting-eventsource@1.1.1/dist/ReconnectingEventSource.min.js"></script>
          <style type="text/css">
            body {
              background-color: #fff;
            }
            .header {
              border-bottom: 1px dashed lightgray;
              padding-bottom: 5px;
            }
            .fixed {
              font-size: 13px;
              padding-left: 10px;
            }
            .centered {
              vertical-align: middle;
            }
            @keyframes yellowfade {
              from {
                background: yellow;
              }
              to {
                background: transparent;
              }
            }            
            .flash {
              animation: yellowfade 3s;
            }      
          </style>
          <meta charset="utf-8">
          <script>
            var connected = false;
            const sse = new ReconnectingEventSource('/schedule');
            const add = (message) => {
              var el = document.createElement("span");
              el.className = "flash";
              el.innerHTML = message.slice(0, 1000) + "<br>"; // fixing Safari display bug with long texts
              document.body.getElementsByClassName("fixed")[0].prepend(el);
            };
            sse.addEventListener("${SCHEDULED_DEPARTURE_EVENT_NAME}", (e) => add("‣ ✈️ " + e.data));
            sse.addEventListener("${DAILY_SCHEDULE_EVENT_NAME}", (e) => add("‣ 🗓 " + e.data));
            sse.addEventListener("error", (e) => {
              if (connected) add("‣ ❌ server disconnected");
              connected = false;
            });
            sse.addEventListener("open", (e) => {
              connected = true;
              add("‣ ✅ server connected");
            });
          </script>
        </head>
        <body>
          <div class="header">
            <img class="centered" src="data:image/gif;base64,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" />
            <span class="centered">Streaming scheduled departure events from NYC Airport (2013 dataset)</span>
          </div>
          <pre class="fixed flash"></pre>
        </body>
      </html>`;
    return {
      body,
      init: {
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    };
  }

  @Get("/schedule")
  api({ url, request }: { url: URL; request: Request }) {
    const accept = request.headers.get("accept") || "text/html";
    if (accept.includes("text/html")) { // HTML request
      return this.html();
    } else {
      const lastKnownId = url.searchParams.get("last-known-id");
      const schedule = lastKnownId !== null
        ? this.scheduleFromId(lastKnownId)
        : this.schedule;
      if (accept.includes("application/json")) { // REST API request
        return {
          body: JSON.stringify(schedule),
          init: {
            headers: {
              "content-type": "application/json",
            },
          },
        };
      } else if (accept.includes("text/event-stream")) { // SSE request
        return {
          body: this.sseEvent({
            id: this.lastId,
            event: DAILY_SCHEDULE_EVENT_NAME,
            data: schedule,
          }),
          init: {
            headers: {
              "content-type": "text/event-stream",
              "grip-hold": "stream",
              "grip-channel": CHANNEL,
              "grip-keep-alive": ":\\n\\n; format=cstring; timeout=30; mode=interval",
            },
          },
        };
      }
    }
    return {
      init: { status: 400 }, // Bad request
    };
  }
}

function gracefulShutdown() {
  db?.close();
  pushpin?.close();
  Deno.exit();
}

onSignal("SIGTERM", () => {
  gracefulShutdown();
});

onSignal("SIGINT", () => {
  gracefulShutdown();
});

console.log("nycflights13 server started.");
console.log(
  `Web test and REST API is available at http://localhost:7999/schedule`,
);

serve({ controllers: [ServerController] });
