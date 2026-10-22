import { beforeEach, describe, expect, it } from "vitest";
import { deleteMessage } from "@/server/services/messages";
import { searchMessages } from "@/server/services/search";
import { createTestGroup, createTestUser, resetDatabase, sendTestMessage } from "./helpers";

describe("search permissions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("only returns messages from conversations the viewer belongs to", async () => {
    const ada = await createTestUser("ada");
    const miles = await createTestUser("miles");
    const june = await createTestUser("june");
    const outsider = await createTestUser("outsider");
    const visible = await createTestGroup(ada.id, [miles.id], "Visible room");
    const hidden = await createTestGroup(miles.id, [june.id], "Hidden room");

    const visibleMessage = await sendTestMessage(ada.id, visible.id, "zebra launch plan is ready");
    const hiddenMessage = await sendTestMessage(
      miles.id,
      hidden.id,
      "zebra compensation discussion is private",
    );

    const adaResults = await searchMessages(ada.id, { q: "zebra" });
    expect(adaResults.map((r) => r.message.id)).toContain(visibleMessage.id);
    expect(adaResults.map((r) => r.message.id)).not.toContain(hiddenMessage.id);

    const outsiderResults = await searchMessages(outsider.id, { q: "zebra" });
    expect(outsiderResults).toEqual([]);
  });

  it("does not leak results through a conversationId filter", async () => {
    const ada = await createTestUser("ada");
    const miles = await createTestUser("miles");
    const outsider = await createTestUser("outsider");
    const room = await createTestGroup(ada.id, [miles.id]);
    await sendTestMessage(ada.id, room.id, "quarterly secret roadmap");

    await expect(
      searchMessages(outsider.id, { q: "roadmap", conversationId: room.id }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("omits deleted messages and matches attachment names", async () => {
    const ada = await createTestUser("ada");
    const miles = await createTestUser("miles");
    const room = await createTestGroup(ada.id, [miles.id]);
    const deleted = await sendTestMessage(ada.id, room.id, "obsolete-markdown-note");
    const live = await sendTestMessage(ada.id, room.id, "current note");

    await deleteMessage(ada.id, deleted.id);
    const results = await searchMessages(miles.id, { q: "note" });
    const ids = results.map((r) => r.message.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(deleted.id);
  });
});
