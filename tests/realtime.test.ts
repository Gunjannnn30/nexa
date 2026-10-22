import type { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRealtimeServer, userRoom } from "@/server/realtime";
import { sendMessage } from "@/server/services/messages";
import { createTestGroup, createTestUser, resetDatabase } from "./helpers";

type Emitted = { room: string; event: string; payload: unknown };

function fakeServer() {
  const emitted: Emitted[] = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
          return true;
        },
      };
    },
  };
  return { io: io as unknown as Server, emitted };
}

describe("realtime fan-out", () => {
  let emitted: Emitted[];

  beforeEach(async () => {
    await resetDatabase();
    const fake = fakeServer();
    emitted = fake.emitted;
    setRealtimeServer(fake.io);
  });

  afterEach(() => {
    setRealtimeServer(null as unknown as Server);
  });

  it("emits each new message privately to every member", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    emitted.length = 0;

    const message = await sendMessage(owner.id, conversation.id, {
      body: "Realtime hello",
      clientId: "realtime_client_1",
      replyToId: null,
      attachmentIds: [],
      contextCards: [],
    });

    const messageEvents = emitted.filter((e) => e.event === "message:new");
    expect(messageEvents).toHaveLength(2);
    expect(messageEvents.map((e) => e.room).sort()).toEqual(
      [userRoom(owner.id), userRoom(member.id)].sort(),
    );
    for (const event of messageEvents) {
      expect(event.payload).toMatchObject({
        id: message.id,
        body: "Realtime hello",
        conversationId: conversation.id,
      });
    }
    expect(emitted.some((e) => e.event === "conversation:updated")).toBe(true);
  });

  it("does not broadcast to users outside the conversation", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const outsider = await createTestUser("outsider");
    const conversation = await createTestGroup(owner.id, [member.id]);
    await sendMessage(owner.id, conversation.id, {
      body: "Private",
      clientId: "realtime_client_2",
      replyToId: null,
      attachmentIds: [],
      contextCards: [],
    });

    expect(emitted.some((e) => e.room === userRoom(outsider.id))).toBe(false);
  });
});
