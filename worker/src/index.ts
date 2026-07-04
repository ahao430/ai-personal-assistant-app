/**
 * 个人 AI 助手 - 信令服务
 *
 * 拓扑：
 *   - 一个 Durable Object = 一个"房间"（单人 = 全部设备共用同一房间）
 *   - 设备 WebSocket 连上 /ws?device=<id> → 加入房间
 *   - 设备发 {type:"update", table:"todos"} → 广播给其他在线设备
 *   - 接收方收到 {type:"update", table, from} → 拉 WebDAV 对应文件
 *
 * 设计原则：信令服务不缓存消息内容（隐私）；只广播"哪张表变了"。
 */

export interface Env {
  ROOM: DurableObjectNamespace;
}

interface DeviceConn {
  deviceId: string;
  ws: WebSocket;
}

export class RoomObject implements DurableObject {
  conns: Map<string, DeviceConn> = new Map();

  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(req.url);
    const deviceId = url.searchParams.get("device") || "anon";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    const conn: DeviceConn = { deviceId, ws: server };
    this.conns.set(deviceId, conn);

    server.send(
      JSON.stringify({ type: "hello", deviceId, online: this.conns.size })
    );

    server.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (msg?.type === "update" && typeof msg.table === "string") {
          // 广播给除发送方以外的所有设备
          const envelope = {
            type: "update",
            table: msg.table,
            from: deviceId,
            ts: Date.now(),
          };
          for (const c of this.conns.values()) {
            if (c.deviceId !== deviceId) {
              try {
                c.ws.send(JSON.stringify(envelope));
              } catch {
                // ignore
              }
            }
          }
        } else if (msg?.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // ignore malformed
      }
    });

    server.addEventListener("close", () => {
      this.conns.delete(deviceId);
    });
    server.addEventListener("error", () => {
      this.conns.delete(deviceId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // 健康检查
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/ws") {
      // 所有设备进入同一个 DO（id 固定 "global"），单人应用足够
      const id = env.ROOM.idFromName("global");
      const stub = env.ROOM.get(id);
      return stub.fetch(req);
    }

    return new Response("Not Found", { status: 404 });
  },
};
