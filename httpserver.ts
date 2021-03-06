/*
 Copyright (c) 2022 János Veres

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { writeAllSync } from "https://deno.land/std@0.130.0/streams/conversion.ts";
import {
  HttpServer,
  Multicast,
  SSE,
} from "https://deno.land/x/deco@0.10.3/mod.ts";
import { abortable } from "https://deno.land/std@0.130.0/async/mod.ts";
import { Database } from "https://deno.land/x/sqlite3@0.4.2/mod.ts";

const HOST = Deno.env.get("HOST") ?? "127.0.0.1";
const PORT = 7999;
const STREAM_REFRESH = 60;
const STREAM_KEEPALIVE = 15;
const SCHEDULED_DEPARTURE_EVENT_NAME = "scheduled_departure";
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours
const DB = new Database("flights.db", { readonly: true, create: false });

class FlightsService {
  #lastId: string | undefined;
  #today: string | undefined;
  #schedule: unknown[] = [];

  getDailySchedule(
    lastId: string | undefined = undefined,
    logQuery = false,
    printHitTime = false,
  ) {
    const date = new Date();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    if (this.#today !== undefined && this.#today !== day) {
      print("🗓 ");
      this.#schedule = [];
    }
    this.#today = day;
    const hours = date.getHours().toString().padStart(2, "0");
    const mins = date.getMinutes().toString().padStart(2, "0");
    const time = `${hours}${mins}`;
    // deno-fmt-ignore
    const query = `select * from flights where fl_date = '2018-${month}-${day}' and crs_dep_time <= '${time}'${lastId ?  " and id > " + lastId : ""};`;
    if (logQuery) console.log(`SQL> ${query}`);
    const res = DB.queryObject(query);
    if (printHitTime && res?.length > 0) {
      print(`● ${hours}:${mins.toString().padStart(2, "0")} `);
    }
    return res;
  }

  getSchedule(lastId = "0"): unknown[] {
    return this.#schedule.filter((el) => {
      const { ID } = el as Record<string, string>;
      if (ID >= lastId) return el;
    });
  }

  multicast = new Multicast<string>();

  constructor() {
    this.refreshSchedule(true);
    this.keepAlive();
  }

  refreshSchedule(forceRefresh = false) {
    const date = new Date();
    const secs = date.getSeconds();
    const refresh = !(secs % STREAM_REFRESH);
    if (refresh || forceRefresh) {
      const prevLastId = this.#lastId;
      const schedule = this.getDailySchedule(
        this.#lastId,
        prevLastId === undefined,
        this.#lastId !== undefined,
      );
      if (schedule.length > 0) {
        this.#lastId = schedule[schedule.length - 1]["ID"] as string;
      }
      if (this.#lastId !== prevLastId) {
        if (prevLastId !== undefined) {
          print(`${"🛫 ".repeat(schedule.length)} ${this.#lastId} `);
          this.#schedule = this.#schedule.concat(schedule);
          schedule.map((sched) =>
            this.multicast.push(
              SSE({
                event: SCHEDULED_DEPARTURE_EVENT_NAME,
                data: JSON.stringify(sched),
              }),
            )
          );
        } else {
          this.#schedule = schedule;
          print(`⏬ (${this.#schedule.length}, ${this.#lastId}) `);
        }
      } else {
        print("·");
      }
    }
    setTimeout(() => this.refreshSchedule(), 1_000);
  }

  keepAlive() {
    this.multicast.push(
      SSE({ comment: "" }),
    );
    setTimeout(() => this.keepAlive(), STREAM_KEEPALIVE * 1_000);
  }

  [Symbol.asyncIterator]() {
    return this.multicast[Symbol.asyncIterator]();
  }
}

class HttpService {
  #flightsService = new FlightsService();

  @HttpServer.Get()
  @HttpServer.Before(() => ({
    headers: { "content-type": "text/event-stream" },
  }))
  async *stream({ signal }: { signal: AbortSignal }) {
    const schedule = this.#flightsService[Symbol.asyncIterator]();
    try {
      yield SSE({ comment: "" }); // wakeup the connection on Safari & Firefox
      for await (const event of abortable(schedule, signal)) {
        yield event;
      }
    } finally {
      schedule.return!();
    }
  }

  @HttpServer.Static({
    assets: [
      { fileName: "index.html", path: "/", contentType: "text/html" },
    ],
  })
  @HttpServer.Before(() => ({
    headers: { "cache-control": `public, max-age=${CACHE_TTL / 1000};` },
  }))
  index() {}

  @HttpServer.Get()
  schedule(
    { urlParams }: { urlParams: string },
  ) {
    // deno-fmt-ignore
    const lastKnownId = new URLSearchParams(urlParams).get("last-known-id") ?? "0";
    const schedule = this.#flightsService.getSchedule(lastKnownId);
    return new Response(JSON.stringify(schedule), {
      headers: {
        "content-type": "application/json",
      },
    });
  }

  @HttpServer.Get()
  metrics() {
    const metrics = `# HELP event_stream_connections Number of connected SSE clients.
# TYPE event_stream_connections gauge
event_stream_connections ${this.#flightsService.multicast.size}
`;
    return new Response(metrics);
  }
}

function print(args: string) {
  writeAllSync(Deno.stdout, new TextEncoder().encode(args));
}

function gracefulShutdown() {
  DB?.close();
  print("...exiting.");
  Deno.exit();
}

Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

HttpServer.serve({
  controllers: [HttpService],
  hostname: HOST,
  port: PORT,
  onStarted() {
    console.info(`Http server started at http://${HOST}:${PORT}/`);
  },
  onError() {},
  onClosed: gracefulShutdown,
});
