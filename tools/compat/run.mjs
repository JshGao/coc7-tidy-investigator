#!/usr/bin/env node
/**
 * Foundry 13/14 + CoC7 7.24/8.16 兼容性 E2E。
 *
 * 用法：
 *   node tools/compat/run.mjs --lane v13
 *   node tools/compat/run.mjs --lane v14
 *   node tools/compat/run.mjs --lane all --headed
 *
 * 依赖：
 *   - tools/.compat/foundry/13.351/  Foundry 13 portable Node build
 *   - tools/.compat/systems/CoC7-7.24 / CoC7-8.16（或本机安装的 8.16）
 *   - tools/node_modules/playwright-core + 本机 Chrome
 *
 * 所有测试数据都在 tools/.compat/data/<lane>/，不触碰正式 Foundry Data。
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CACHE = path.join(ROOT, "tools/.compat");
const APP14 = process.env.FOUNDRY14_APP ?? "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MODULE_ID = "coc7-tidy-investigator";
const SHEET_IDS = {
  character: `${MODULE_ID}.Coc7TidyInvestigatorSheet`,
  npc: `${MODULE_ID}.Coc7TidyNpcSheet`,
  container: `${MODULE_ID}.Coc7TidyContainerSheet`,
};

const LANES = {
  v13: {
    id: "v13",
    core: "13.351",
    system: "7.24",
    port: 30133,
    foundry: path.join(CACHE, "foundry/13.351/main.mjs"),
    data: path.join(CACHE, "data/13.351"),
    systemSource: path.join(CACHE, "systems/CoC7-7.24"),
  },
  v14: {
    id: "v14",
    core: "14.369",
    system: "8.16",
    port: 30143,
    foundry: path.join(APP14, "main.mjs"),
    data: path.join(CACHE, "data/14.369"),
    systemSource: path.join(CACHE, "systems/CoC7-8.16"),
  },
};

const args = new Set(process.argv.slice(2));
const headed = args.has("--headed");
const keep = args.has("--keep");
const onlyArg = [...args].find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;
const laneArg = [...args].find((a) => a.startsWith("--lane="))?.split("=")[1] ?? "v13";
const lanes = laneArg === "all" ? ["v13", "v14"] : [laneArg];

const results = [];
let failures = 0;

function log(...parts) {
  console.log(...parts);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* -------------------------------------------- */
/* 数据目录                                      */
/* -------------------------------------------- */

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

function ensureLane(lane) {
  assert(fs.existsSync(lane.foundry), `找不到 Foundry 入口：${lane.foundry}`);
  assert(fs.existsSync(lane.systemSource), `找不到 CoC7 ${lane.system}：${lane.systemSource}`);

  const config = path.join(lane.data, "Config");
  const data = path.join(lane.data, "Data");
  const world = path.join(data, "worlds/e2e");
  fs.mkdirSync(path.join(config), { recursive: true });
  fs.mkdirSync(path.join(world, "data"), { recursive: true });

  const licenseSrc = process.env.FOUNDRY_LICENSE_PATH
    ?? path.join(os.homedir(), "Library/Application Support/FoundryVTT/Config/license.json");
  const licenseDest = path.join(config, "license.json");
  if (!fs.existsSync(licenseDest)) {
    assert(fs.existsSync(licenseSrc), `缺少 Foundry license：${licenseSrc}`);
    fs.copyFileSync(licenseSrc, licenseDest);
  }

  copyDir(lane.systemSource, path.join(data, "systems/CoC7"));
  copyDir(path.join(ROOT, "module"), path.join(data, "modules", MODULE_ID));

  const worldJson = {
    title: `E2E CoC7 ${lane.system} / FVTT ${lane.core}`,
    system: "CoC7",
    id: "e2e",
    coreVersion: lane.core,
    compatibility: { minimum: lane.core.split(".")[0], verified: lane.core.split(".")[0] },
    systemVersion: lane.system,
    description: "",
    flags: {},
  };
  fs.writeFileSync(path.join(world, "world.json"), `${JSON.stringify(worldJson, null, 2)}\n`);
}

/* -------------------------------------------- */
/* 启动/停止服务                                 */
/* -------------------------------------------- */

function waitPort(port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(timeout, () => done(false));
  });
}

async function waitHttp(url, timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === 200 || response.status === 302) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

async function startLane(lane) {
  if (await waitPort(lane.port)) return { process: null, reused: true };
  fs.mkdirSync(path.join(CACHE, "logs"), { recursive: true });
  const logPath = path.join(CACHE, "logs", `${lane.id}.log`);
  const out = fs.openSync(logPath, "w");
  const proc = spawn(process.execPath, [
    lane.foundry,
    `--dataPath=${lane.data}`,
    `--port=${lane.port}`,
    "--noupnp",
    "--world=e2e",
  ], {
    cwd: path.dirname(lane.foundry),
    stdio: ["ignore", out, out],
    env: { ...process.env, NODE_ENV: "test" },
  });
  proc.once("exit", (code) => log(`[${lane.id}] Foundry 退出，code=${code}，日志：${logPath}`));
  assert(await waitHttp(`http://127.0.0.1:${lane.port}/join`), `[${lane.id}] Foundry 启动超时：${logPath}`);
  return { process: proc, reused: false, logPath };
}

async function stopLane(server) {
  if (!server?.process) return;
  server.process.kill("SIGTERM");
  for (let i = 0; i < 40 && server.process.exitCode === null; i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (server.process.exitCode === null) server.process.kill("SIGKILL");
}

/* -------------------------------------------- */
/* Playwright 会话                               */
/* -------------------------------------------- */

async function join(page, lane) {
  await page.goto(`http://127.0.0.1:${lane.port}/join`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);

  if (!page.url().includes("/game")) {
    const legacySelect = page.locator("select[name=userid]");
    if (await legacySelect.count()) {
      await page.waitForFunction(() => document.querySelector("select[name=userid]")?.options.length > 1, null, { timeout: 30000 });
      await legacySelect.selectOption({ label: "Gamemaster" });
      await page.click("#join-game-form button[type=submit]");
    } else {
      await page.waitForFunction(() => (document.querySelector("#join-username")?.options?.length ?? 0) > 1, null, { timeout: 30000 });
      await page.selectOption("#join-username", { label: "Gamemaster" });
      await page.click("#join-game-form button[type=submit]");
    }
  }

  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
}

async function enableModule(page, lane) {
  const active = await page.evaluate((id) => Boolean(game.modules.get(id)?.active), MODULE_ID);
  if (active) return false;
  await page.evaluate(async (id) => {
    const config = foundry.utils.duplicate(game.settings.get("core", "moduleConfiguration") ?? {});
    config[id] = true;
    await game.settings.set("core", "moduleConfiguration", config);
  }, MODULE_ID);
  await page.reload({ waitUntil: "load" });
  await join(page, lane);
  const nowActive = await page.evaluate((id) => Boolean(game.modules.get(id)?.active), MODULE_ID);
  assert(nowActive, "模组启用失败");
  return true;
}

function newPage(browser) {
  return browser.newPage({ viewport: { width: 1280, height: 950 } });
}

function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Cannot set language")) {
      errors.push(`CONSOLE ${message.text()}`);
    }
  });
  return errors;
}

/* -------------------------------------------- */
/* 页面内辅助                                    */
/* -------------------------------------------- */

async function clearActors(page) {
  await page.evaluate(async () => {
    // 先关掉角色卡：删除 Actor 时仍打开的 sheet 异步渲染会触发 Foundry 的
    // "Actor id does not exist" pageerror，属于测试清理竞态。
    const apps = [...(foundry.applications.instances?.values?.() ?? [])];
    for (const app of apps) {
      if (app?.document?.documentName === "Actor") await app.close?.();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    await Actor.deleteDocuments(game.actors.map((actor) => actor.id));
  });
}

async function createActor(page, payload) {
  return page.evaluate(async (data) => {
    const { items = [], ...rest } = data;
    const actor = await Actor.create(rest);
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
    return actor.id;
  }, payload);
}

async function getActorSnapshot(page, actorId) {
  return page.evaluate((id) => {
    const actor = game.actors.get(id);
    return JSON.parse(JSON.stringify(actor.toObject()));
  }, actorId);
}

async function openTidy(page, actorId, type = "character") {
  await page.evaluate(async ({ id, sheetId }) => {
    const actor = game.actors.get(id);
    for (const app of Object.values(actor.apps ?? {})) await app.close();
    await actor.setFlag("core", "sheetClass", sheetId);
    actor._sheet = null;
    actor.sheet.render(true);
  }, { id: actorId, sheetId: SHEET_IDS[type] });
  await page.waitForSelector(".coc7-tidy", { timeout: 20000 });
  await page.waitForTimeout(700);
}

async function openDefaultSheet(page, actorId) {
  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    for (const app of Object.values(actor.apps ?? {})) await app.close();
    await actor.unsetFlag("core", "sheetClass");
    actor._sheet = null;
    actor.sheet.render(true);
  }, actorId);
  await page.waitForTimeout(800);
  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    for (const app of Object.values(actor.apps ?? {})) await app.close();
  }, actorId);
}

async function readSkillRows(page, scope = ".c7t-sheet") {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector) ?? document;
    const section = root.querySelector('section.tab[data-tab="skills"]') ?? root;
    return [...section.querySelectorAll(".c7t-row[data-item-id]")].map((row) => {
      const valueCell = row.querySelector(".col-val");
      const input = valueCell?.querySelector("input");
      return {
        id: row.dataset.itemId,
        name: row.querySelector(".c7t-row-name")?.textContent?.trim() ?? "",
        value: input ? input.value : valueCell?.textContent?.trim() ?? "",
        base: row.querySelector(".col-base")?.textContent?.trim() ?? "",
        half: row.querySelector(".col-half")?.textContent?.trim() ?? "",
        fifth: row.querySelector(".col-fifth")?.textContent?.trim() ?? "",
      };
    });
  }, scope);
}

async function clickTab(page, tab) {
  await page.evaluate((id) => {
    const link = document.querySelector(`.c7t-sheet nav.c7t-tabs a[data-tab="${id}"]`);
    link?.click();
  }, tab);
  await page.waitForTimeout(400);
}

async function itemData(page, actorId, itemName) {
  return page.evaluate(({ id, name }) => {
    const actor = game.actors.get(id);
    const item = actor.items.find((entry) => entry.type === "skill" && entry.name === name);
    if (!item) return null;
    return {
      id: item.id,
      value: item.value,
      rawValue: item.rawValue,
      systemValue: item.system?.value,
      adjustments: JSON.parse(JSON.stringify(item.system?.adjustments ?? {})),
    };
  }, { id: actorId, name: itemName });
}

/* -------------------------------------------- */
/* 测试用例                                      */
/* -------------------------------------------- */

async function testInvestigator(page, lane, errors) {
  await clearActors(page);
  const actorId = await createActor(page, {
    name: "E2E 技能保留",
    type: "character",
    items: [
      {
        name: "侦查",
        type: "skill",
        system: {
          base: "25",
          adjustments: { personal: 20, occupation: 10, archetype: 0, experiencePackage: 0, experience: 0 },
          skillName: "侦查",
          specialization: "",
          properties: {},
          flags: { developement: false },
        },
      },
      {
        name: "图书馆使用",
        type: "skill",
        system: {
          base: "20",
          adjustments: { personal: 0, occupation: 15, archetype: 0, experiencePackage: 0, experience: 5 },
          skillName: "图书馆使用",
          specialization: "",
          properties: {},
          flags: { developement: true },
        },
      },
    ],
  });

  const snapshotBefore = await getActorSnapshot(page, actorId);
  await openTidy(page, actorId);
  const rows = await readSkillRows(page);
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert(byName["侦查"]?.value === "55", `侦查当前值应为 55，实际 ${byName["侦查"]?.value}`);
  assert(byName["图书馆使用"]?.value === "40", `图书馆使用当前值应为 40，实际 ${byName["图书馆使用"]?.value}`);

  const snapshotAfter = await getActorSnapshot(page, actorId);
  const beforeItems = JSON.stringify(snapshotBefore.items);
  const afterItems = JSON.stringify(snapshotAfter.items);
  assert(beforeItems === afterItems, "切换卡片不应修改 Actor 数据");

  const tabs = await page.evaluate(() => [...document.querySelectorAll("nav.c7t-tabs a[data-tab]")].map((a) => a.dataset.tab));
  assert(tabs.length === 7, `调查员卡应有 7 个 tab，实际 ${tabs.length}: ${tabs.join(",")}`);
  for (const tab of tabs) {
    await clickTab(page, tab);
    const active = await page.evaluate((id) => document.querySelector(`.c7t-sheet section.tab[data-tab="${id}"]`)?.classList.contains("active"), tab);
    assert(active, `tab ${tab} 未激活`);
  }
  await clickTab(page, "skills");

  // 切回系统默认卡再切回来：数据不应变化，技能值仍应正确
  await openDefaultSheet(page, actorId);
  await openTidy(page, actorId);
  const rowsAgain = await readSkillRows(page);
  const again = Object.fromEntries(rowsAgain.map((row) => [row.name, row]));
  assert(again["侦查"]?.value === "55", `切回后侦查应为 55，实际 ${again["侦查"]?.value}`);
  const snapshotAgain = await getActorSnapshot(page, actorId);
  assert(
    JSON.stringify(snapshotAgain.items) === beforeItems,
    "在两张卡之间来回切换不应修改技能数据",
  );

  return { actorId, rows: rowsAgain, tabs, snapshotBefore, snapshotAfter: snapshotAgain };
}

async function testSkillEdit(page, actorId, errors) {
  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    await actor.update({ "system.flags.locked": false });
    actor.sheet.render({ force: false });
  }, actorId);
  await page.waitForTimeout(800);

  const inputExists = await page.evaluate(() => {
    const row = [...document.querySelectorAll('section.tab[data-tab="skills"] .c7t-row')]
      .find((entry) => entry.textContent.includes("侦查"));
    return Boolean(row?.querySelector('input[data-field="experience"]'));
  });
  assert(inputExists, "解锁后未出现技能经验输入框");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('section.tab[data-tab="skills"] .c7t-row')]
      .find((entry) => entry.textContent.includes("侦查"));
    const input = row.querySelector('input[data-field="experience"]');
    input.value = "5";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(900);

  const data = await itemData(page, actorId, "侦查");
  assert(data?.value === 60, `编辑后侦查应为 60，实际 ${data?.value}（adjustments=${JSON.stringify(data?.adjustments)}）`);

  const row = (await readSkillRows(page)).find((entry) => entry.name === "侦查");
  assert(row?.value === "60", `编辑后卡片应显示 60，实际 ${row?.value}`);
  return data;
}

async function testLegacySkill(page, lane, errors) {
  if (lane.id !== "v13") return null;
  await clearActors(page);
  const actorId = await createActor(page, {
    name: "E2E 旧角色",
    type: "character",
    items: [{
      name: "侦查",
      type: "skill",
      system: {
        base: "25",
        value: 55,
        adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 },
        skillName: "侦查",
        specialization: "",
        properties: {},
        flags: { developement: false },
      },
    }],
  });
  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    const item = actor.items.find((entry) => entry.type === "skill");
    await item.update({ "system.value": 55 });
  }, actorId);

  await openTidy(page, actorId);
  const row = (await readSkillRows(page))[0];
  assert(row?.value === "55", `旧角色技能应显示 55，实际 ${row?.value}`);

  await page.evaluate(async (id) => {
    const actor = game.actors.get(id);
    await actor.update({ "system.flags.locked": false });
    actor.sheet.render({ force: false });
  }, actorId);
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('section.tab[data-tab="skills"] .c7t-row')]
      .find((entry) => entry.textContent.includes("侦查"));
    const input = row.querySelector('input[data-field="experience"]');
    input.value = "5";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const data = await itemData(page, actorId, "侦查");
  assert(data?.value === 60, `旧角色编辑后应为 60，实际 ${data?.value}（adjustments=${JSON.stringify(data?.adjustments)}）`);
  return { before: row.value, after: data.value, adjustments: data.adjustments };
}

async function testWeapon(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "E2E 武器", type: "character" });
    const [skill] = await actor.createEmbeddedDocuments("Item", [{
      name: "手枪",
      type: "skill",
      system: {
        base: "40",
        adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 },
        skillName: "手枪",
        specialization: "",
        properties: {},
        flags: { developement: false },
      },
    }]);
    await actor.createEmbeddedDocuments("Item", [{
      name: "点38左轮",
      type: "weapon",
      system: {
        skill: { main: { id: skill.id, name: "手枪" }, alternativ: { id: "", name: "" } },
        bullets: 6,
        ammo: 0,
        usesPerRound: { normal: "1", max: "1" },
        range: { normal: { value: "15", damage: "1D10" } },
        properties: { rngd: true, shotgun: false },
        malfunction: 100,
      },
    }]);
    return actor.id;
  });
  await openTidy(page, actorId);
  await clickTab(page, "summary");
  await page.waitForTimeout(500);
  const weapon = await page.evaluate(() => {
    const row = document.querySelector('section.tab[data-tab="summary"] .c7t-table.weapons .c7t-row');
    return row ? {
      skill: row.querySelector(".col-skill")?.textContent?.trim(),
      ammo: row.querySelector(".col-ammo .c7t-ammo-count")?.textContent?.trim(),
      reload: Boolean(row.querySelector(".c7t-ammo-reload")),
    } : null;
  });
  assert(weapon, "简表未渲染武器行");
  assert(weapon.skill === "40%", `武器技能应为 40%，实际 ${weapon.skill}`);
  assert(weapon.ammo === "0/6", `弹药应为 0/6，实际 ${weapon.ammo}`);
  assert(weapon.reload, "射击武器应显示装填按钮");

  await page.locator('section.tab[data-tab="summary"] .c7t-ammo-reload').click();
  await page.waitForTimeout(900);
  const ammo = await page.evaluate(() => {
    const item = game.actors.contents[0]?.items.find((entry) => entry.type === "weapon");
    return item?.system?.ammo;
  });
  assert(ammo === 6, `装填后 ammo 应为 6，实际 ${ammo}`);
  return { ...weapon, ammoAfter: ammo };
}

async function testNpc(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "E2E NPC", type: "npc" });
    await actor.createEmbeddedDocuments("Item", [{
      name: "格斗",
      type: "skill",
      system: {
        base: "50",
        value: 50,
        adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 },
        skillName: "格斗",
        specialization: "",
        properties: {},
        flags: { developement: false },
      },
    }]);
    await actor.update({
      "system.special.attacksPerRound": "2",
      "system.special.sanLoss.checkPassed": "1D4",
      "system.special.sanLoss.checkFailled": "1D10",
      "system.attribs.armor.value": 3,
    });
    return actor.id;
  });
  await openTidy(page, actorId, "npc");
  const rows = await readSkillRows(page);
  assert(rows.length === 1, `NPC 技能行数应为 1，实际 ${rows.length}`);
  assert(rows[0].value === "50", `NPC 技能值应为 50，实际 ${rows[0].value}`);
  const tabs = await page.evaluate(() => [...document.querySelectorAll("nav.c7t-tabs a[data-tab]")].map((a) => a.dataset.tab));
  assert(tabs.length === 6, `NPC 卡应有 6 个 tab，实际 ${tabs.length}`);
  for (const tab of tabs) {
    await clickTab(page, tab);
    const active = await page.evaluate((id) => document.querySelector(`.c7t-sheet section.tab[data-tab="${id}"]`)?.classList.contains("active"), tab);
    assert(active, `NPC tab ${tab} 未激活`);
  }
  return { rows, tabs };
}

async function testContainer(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "E2E 容器", type: "container" });
    await actor.createEmbeddedDocuments("Item", [{ name: "手电筒", type: "item", system: { quantity: 1 } }]);
    return actor.id;
  });
  await openTidy(page, actorId, "container");
  const tabs = await page.evaluate(() => [...document.querySelectorAll("nav.c7t-tabs a[data-tab]")].map((a) => a.dataset.tab));
  assert(tabs.length === 4, `容器卡应有 4 个 tab，实际 ${tabs.length}`);
  const text = await page.evaluate(() => document.querySelector(".c7t-sheet")?.innerText ?? "");
  assert(text.includes("手电筒"), "容器卡未显示物品");
  return { tabs };
}

async function testNpcEdit(page, lane, errors) {
  const actorId = page.__npcActorId;
  assert(actorId, "缺少 NPC 场景的 actor");
  const before = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const item = actor.items.find((entry) => entry.type === "skill");
    return { value: item.value, systemValue: item.system?.value };
  }, actorId);
  await page.evaluate(() => {
    const input = document.querySelector('section.tab[data-tab="skills"] .c7t-skill-input');
    input.value = "55";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const item = actor.items.find((entry) => entry.type === "skill");
    return { value: item.value, systemValue: item.system?.value };
  }, actorId);
  assert(after.value === 55, `NPC 技能编辑后应为 55，实际 ${after.value}（before=${before.value}）`);
  return { before, after };
}

async function testConditions(page, lane, errors) {
  await clearActors(page);
  const actorId = await createActor(page, { name: "E2E 状态", type: "character" });
  await openTidy(page, actorId);
  await clickTab(page, "skills");
  await page.locator('.c7t-chip[data-key="prone"]').click();
  await page.waitForTimeout(600);
  let active = await page.evaluate((id) => Boolean(game.actors.get(id).system?.conditions?.prone?.value), actorId);
  assert(active, "点击「倒地」后 conditions.prone 应为 true");
  await page.locator('.c7t-chip[data-key="prone"]').click();
  await page.waitForTimeout(600);
  active = await page.evaluate((id) => Boolean(game.actors.get(id).system?.conditions?.prone?.value), actorId);
  assert(!active, "再次点击「倒地」后应为 false");

  await page.locator('.c7t-chip[data-key="prone"]').click();
  await page.locator('.c7t-chip[data-key="tempoInsane"]').click();
  await page.waitForTimeout(500);
  await clickTab(page, "notes");
  await page.waitForTimeout(500);
  await page.locator('[data-action="clearConditions"]').click();
  await page.waitForTimeout(1500);
  const remaining = await page.evaluate((id) => {
    const conditions = game.actors.get(id).system?.conditions ?? {};
    return Object.entries(conditions).filter(([, value]) => value?.value).map(([key]) => key);
  }, actorId);
  assert(remaining.length === 0, `清除状态后仍有：${remaining.join(",")}`);
  return { remaining };
}

async function testMoney(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({
      name: "E2E 金钱",
      type: "character",
      system: { monetary: { cash: 10, assets: 200, spendingLevel: 5 } },
    });
    await actor.createEmbeddedDocuments("Item", [{
      name: "信用评级",
      type: "skill",
      flags: { CoC7: { cocidFlag: { id: "i.skill.credit-rating" } } },
      system: {
        base: "30",
        adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 },
        skillName: "信用评级",
        specialization: "",
        properties: {},
        flags: { developement: false },
      },
    }]);
    return actor.id;
  });
  await openTidy(page, actorId);
  await clickTab(page, "possessions");
  const text = await page.evaluate(() => document.querySelector('section.tab[data-tab="possessions"] .c7t-money')?.innerText ?? "");
  assert(text.includes("30"), `信用评级应显示 30，实际：${text}`);
  assert(!/现金\s*\n?—/.test(text) && !/资产\s*\n?—/.test(text), `现金/资产不应为空，实际：${text}`);
  return { text };
}

async function testBooks(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async (is13) => {
    const actor = await Actor.create({ name: "E2E 书籍", type: "character" });
    if (is13) {
      await actor.createEmbeddedDocuments("Item", [{
        name: "死灵之书",
        type: "book",
        system: { study: { progress: 2, necessary: 10 } },
      }]);
    } else {
      await actor.update({
        "system.books": [{ id: foundry.utils.randomID(), name: "死灵之书", progress: 2, necessary: 10, units: "CoC7.weeks" }],
      });
    }
    await actor.update({ "system.flags.locked": false });
    return actor.id;
  }, lane.id === "v13");
  await openTidy(page, actorId);
  await clickTab(page, "notes");
  const rowText = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('section.tab[data-tab="notes"] .c7t-table .c7t-row')];
    return rows.map((row) => row.innerText).join("\n");
  });
  assert(rowText.includes("死灵之书"), `笔记页未显示书籍：${rowText}`);
  const before = await page.evaluate(({ id, is13 }) => {
    const actor = game.actors.get(id);
    return is13
      ? actor.items.find((item) => item.type === "book")?.system?.study?.progress
      : actor.system.books?.[0]?.progress;
  }, { id: actorId, is13: lane.id === "v13" });
  await page.evaluate(() => {
    const input = document.querySelector('section.tab[data-tab="notes"] .c7t-book-progress');
    input.value = "7";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate(({ id, is13 }) => {
    const actor = game.actors.get(id);
    return is13
      ? actor.items.find((item) => item.type === "book")?.system?.study?.progress
      : actor.system.books?.[0]?.progress;
  }, { id: actorId, is13: lane.id === "v13" });
  assert(after === 7, `书籍进度应写回 7，实际 ${after}（before=${before}）`);
  return { before, after };
}

async function testSanLink(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "E2E SAN 链接", type: "npc" });
    await actor.update({
      "system.special.sanLoss.checkPassed": "1D4",
      "system.special.sanLoss.checkFailled": "1D10",
      "system.infos.type": "深潜者",
    });
    return actor.id;
  });
  await openTidy(page, actorId, "npc");
  await clickTab(page, "combat");
  const before = await page.evaluate(() => game.messages.size);
  await page.locator('[data-action="sanLossLink"]').first().click();
  await page.waitForTimeout(1500);
  const messages = await page.evaluate(() => [...game.messages.contents].slice(-2).map((message) => message.content));
  const after = await page.evaluate(() => game.messages.size);
  assert(after > before, `SAN 链接未生成聊天消息：${before} -> ${after}`);
  assert(messages.some((content) => /sanloss|SAN 损失|理智/i.test(content)), `SAN 链接内容异常：${messages.join(" | ")}`);
  return { before, after };
}

async function testImportSt(page, lane, errors) {
  await clearActors(page);
  const actorId = await createActor(page, { name: "E2E 海豹导入", type: "character" });
  await openTidy(page, actorId);
  await page.locator('[data-action="importSt"]').first().click();
  await page.waitForSelector('textarea[name="st"]', { timeout: 10000 });
  await page.fill(
    'textarea[name="st"]',
    ".st 力量:60敏捷50+20体质50 体型60 外貌50 智力70 意志60 教育80 幸运50 侦查80 图书馆使用60射击(手枪)70 san55",
  );
  const submitted = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((entry) =>
      entry.dataset.action === "ok" || /^(导入|Import|OK|确定)$/i.test(entry.textContent.trim()),
    );
    button?.click();
    return Boolean(button);
  });
  assert(submitted, "未找到导入对话框的确认按钮");
  await page.waitForTimeout(2200);
  const state = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const char = (key) => actor.system.characteristics?.[key]?.value;
    const skill = (name) => {
      const item = actor.items.find((entry) => entry.type === "skill" && entry.name.replace(/\s+/g, "").includes(name.replace(/\s+/g, "")));
      return item ? { name: item.name, value: item.value, base: item.base ?? item.system?.adjustments?.base, spec: item.system?.specialization, skillName: item.system?.skillName } : null;
    };
    return {
      str: char("str"),
      dex: char("dex"),
      int: char("int"),
      edu: char("edu"),
      luck: actor.system.attribs?.lck?.value,
      san: actor.system.attribs?.san?.value,
      skills: {
        侦查: skill("侦查"),
        图书馆使用: skill("图书馆使用"),
        射击: skill("射击(手枪)"),
      },
      warnings: game.notifications?.queue?.()?.map?.((n) => n.message ?? n.text) ?? [],
    };
  }, actorId);
  assert(state.str === 60 && state.dex === 70, `特性导入失败：${JSON.stringify(state)}`);
  assert(state.int === 70 && state.edu === 80, `智力/教育导入失败：${JSON.stringify(state)}`);
  assert(state.luck === 50, `幸运导入失败：${state.luck}`);
  assert(state.san === 55, `SAN 导入失败：${state.san}`);
  assert(state.skills.侦查?.value === 80, `侦查导入失败：${JSON.stringify(state.skills.侦查)}`);
  assert(Number(state.skills.侦查?.base) > 0, `侦查基础值应从系统技能包带入：${JSON.stringify(state.skills.侦查)}`);
  assert(state.skills.图书馆使用?.value === 60, `图书馆使用导入失败：${JSON.stringify(state.skills.图书馆使用)}`);
  assert(state.skills.射击?.value === 70, `射击(手枪)导入失败：${JSON.stringify(state.skills.射击)}`);
  assert(state.skills.射击?.spec === "射击" && state.skills.射击?.skillName === "手枪", `射击专长拆分错误：${JSON.stringify(state.skills.射击)}`);
  assert(Number(state.skills.射击?.base) > 0, `射击(手枪)基础值应从系统技能包带入：${JSON.stringify(state.skills.射击)}`);

  // 第二次导入：+ 增量
  await page.locator('[data-action="importSt"]').first().click();
  await page.waitForSelector('textarea[name="st"]', { timeout: 10000 });
  await page.fill('textarea[name="st"]', ".st 力量+5 侦查+5");
  const submitted2 = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((entry) =>
      entry.dataset.action === "ok" || /^(导入|Import|OK|确定)$/i.test(entry.textContent.trim()),
    );
    button?.click();
    return Boolean(button);
  });
  assert(submitted2, "未找到第二次导入的确认按钮");
  await page.waitForTimeout(1500);
  const added = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const skill = actor.items.find((entry) => entry.type === "skill" && entry.name.includes("侦查"));
    return { str: actor.system.characteristics?.str?.value, skill: skill?.value };
  }, actorId);
  assert(added.str === 65, `+5 力量导入失败：${added.str}`);
  assert(added.skill === 85, `+5 侦查导入失败：${added.skill}`);
  return { ...state, added };
}

async function testLegacyMigrationPrefer(page, lane, errors) {
  if (lane.id !== "v13") return null;
  await page.evaluate(() => game.settings.set("coc7-tidy-investigator", "legacySkillMigration", true));
  try {
    await clearActors(page);
    const actorId = await page.evaluate(async () => {
      const actor = await Actor.create({ name: "E2E 职业优先迁移", type: "character" });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "侦查", type: "skill",
          system: { base: "25", value: 55, adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 }, skillName: "侦查", specialization: "", properties: {}, flags: { occupation: true, developement: false } },
        },
        {
          name: "聆听", type: "skill",
          system: { base: "20", value: 40, adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 }, skillName: "聆听", specialization: "", properties: {}, flags: { occupation: false, developement: false } },
        },
        {
          name: "图书馆使用", type: "skill",
          system: { base: "20", value: 30, adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 }, skillName: "图书馆使用", specialization: "", properties: {}, flags: { occupation: true, developement: false } },
        },
      ]);
      await actor.update({ "system.development.occupation": 100, "system.development.personal": 120 });
      for (const item of actor.items.filter((entry) => entry.type === "skill")) {
        await item.update({ "system.value": item.name === "侦查" ? 55 : item.name === "聆听" ? 40 : 30 });
      }
      await actor.update({ "system.flags.locked": false });
      return actor.id;
    });
    await openTidy(page, actorId);
    // 用一次 0 值编辑触发批量迁移（不会额外加点）
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('section.tab[data-tab="skills"] .c7t-row')]
        .find((entry) => entry.textContent.includes("侦查"));
      const input = row.querySelector('input[data-field="experience"]');
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(1200);
    const result = await page.evaluate((id) => {
      const actor = game.actors.get(id);
      const rows = {};
      for (const item of actor.items.filter((entry) => entry.type === "skill")) {
        rows[item.name] = {
          value: item.value,
          systemValue: item.system?.value,
          adjustments: JSON.parse(JSON.stringify(item.system?.adjustments ?? {})),
        };
      }
      return rows;
    }, actorId);
    assert(result.侦查?.adjustments?.occupation === 30, `侦查应优先使用职业点 30：${JSON.stringify(result.侦查)}`);
    assert(result.侦查?.adjustments?.personal === 0, `侦查不应使用兴趣点：${JSON.stringify(result.侦查)}`);
    assert(result.图书馆使用?.adjustments?.occupation === 10, `图书馆使用应使用职业点 10：${JSON.stringify(result.图书馆使用)}`);
    assert(result.聆听?.adjustments?.personal === 20, `聆听应使用兴趣点 20：${JSON.stringify(result.聆听)}`);
    assert(result.聆听?.adjustments?.occupation === 0, `聆听不应使用职业点：${JSON.stringify(result.聆听)}`);
    assert(Object.values(result).every((row) => row.adjustments?.experience === 0), `预算足够时不应有 experience 兜底：${JSON.stringify(result)}`);

    // 预算不足：职业点 → 兴趣点 → experience 兜底
    await clearActors(page);
    const fallbackId = await page.evaluate(async () => {
      const actor = await Actor.create({ name: "E2E 迁移兜底", type: "character" });
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "侦查", type: "skill",
          system: { base: "25", value: 55, adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 }, skillName: "侦查", specialization: "", properties: {}, flags: { occupation: true } },
        },
        {
          name: "聆听", type: "skill",
          system: { base: "20", value: 40, adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 }, skillName: "聆听", specialization: "", properties: {}, flags: { occupation: false } },
        },
      ]);
      await actor.update({ "system.development.occupation": 10, "system.development.personal": 5, "system.flags.locked": false });
      for (const item of actor.items.filter((entry) => entry.type === "skill")) {
        await item.update({ "system.value": item.name === "侦查" ? 55 : 40 });
      }
      return actor.id;
    });
    await openTidy(page, fallbackId);
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('section.tab[data-tab="skills"] .c7t-row')]
        .find((entry) => entry.textContent.includes("侦查"));
      const input = row.querySelector('input[data-field="experience"]');
      input.value = "0";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(1200);
    const fallback = await page.evaluate((id) => {
      const actor = game.actors.get(id);
      const rows = {};
      for (const item of actor.items.filter((entry) => entry.type === "skill")) {
        rows[item.name] = JSON.parse(JSON.stringify(item.system?.adjustments ?? {}));
      }
      return rows;
    }, fallbackId);
    assert(fallback.侦查?.occupation === 10, `兜底：侦查应先消耗职业点 10：${JSON.stringify(fallback.侦查)}`);
    assert(fallback.侦查?.personal === 5, `兜底：侦查应再消耗兴趣点 5：${JSON.stringify(fallback.侦查)}`);
    assert(fallback.侦查?.experience === 15, `兜底：侦查剩余 15 应进 experience：${JSON.stringify(fallback.侦查)}`);
    assert(fallback.聆听?.experience === 20, `兜底：聆听剩余 20 应进 experience：${JSON.stringify(fallback.聆听)}`);
    return { exact: result, fallback };
  } finally {
    await page.evaluate(() => game.settings.set("coc7-tidy-investigator", "legacySkillMigration", false));
  }
}

async function testMythosFlags(page, lane, errors) {
  await clearActors(page);
  const actorId = await createActor(page, { name: "E2E 秘法", type: "character" });
  await openTidy(page, actorId);
  await clickTab(page, "notes");
  await page.locator('.c7t-chip[data-flag="mythosHardened"]').click();
  await page.waitForTimeout(800);
  const read = (id) => page.evaluate((actorId) => {
    const actor = game.actors.get(actorId);
    return {
      systemFlag: Boolean(actor.system?.flags?.mythosHardened),
      docFlag: Boolean(actor.getFlag?.("CoC7", "mythosHardened")),
      active: Boolean(document.querySelector('.c7t-chip[data-flag="mythosHardened"]')?.classList.contains("is-active")),
    };
  }, id);
  const on = await read(actorId);
  assert(on.systemFlag || on.docFlag, `秘法硬化未写入（7.24 应写 Actor flag，8.16 应写 system.flags）：${JSON.stringify(on)}`);
  await page.locator('.c7t-chip[data-flag="mythosHardened"]').click();
  await page.waitForTimeout(800);
  const off = await read(actorId);
  assert(!off.systemFlag && !off.docFlag, `秘法硬化未取消：${JSON.stringify(off)}`);
  return { on, off };
}

async function testSettings(page, lane, errors) {
  const actorId = await createActor(page, { name: "E2E 设置", type: "character" });
  await openTidy(page, actorId);
  await page.evaluate(() => game.settings.set("coc7-tidy-investigator", "compactMode", true));
  await page.waitForTimeout(800);
  let compact = await page.evaluate(() => document.querySelector(".c7t-sheet")?.classList.contains("is-compact"));
  assert(compact, "开启紧凑模式后卡片未加 is-compact");
  await page.evaluate(() => game.settings.set("coc7-tidy-investigator", "compactMode", false));
  await page.waitForTimeout(800);
  compact = await page.evaluate(() => document.querySelector(".c7t-sheet")?.classList.contains("is-compact"));
  assert(!compact, "关闭紧凑模式后卡片仍为 is-compact");
  return { compact };
}

async function testNpcRolls(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({
      name: "E2E NPC 投骰",
      type: "npc",
      system: { characteristics: { str: { value: 50 } } },
    });
    await actor.update({ "system.special.attacksPerRound": "@STR" });
    return actor.id;
  });
  await openTidy(page, actorId, "npc");
  await clickTab(page, "combat");
  const before = await page.evaluate(() => game.messages.size);
  await page.locator('[data-action="rollAttacksPerRound"]').first().click();
  await page.waitForTimeout(1500);
  const chats = await page.evaluate(() => [...game.messages.contents].slice(-3).map((message) => message.content));
  assert(chats.length > 0, "每轮攻击未生成聊天消息");
  const after = await page.evaluate(() => game.messages.size);
  assert(after > before, `聊天消息数未增加：${before} -> ${after}`);
  assert(chats.some((content) => content.includes("50")), `每轮攻击公式 @STR 未按 50 计算：${chats.join(" | ")}`);
  return { before, after };
}

async function testGrowth(page, lane, errors) {
  await clearActors(page);
  const actorId = await page.evaluate(async () => {
    const actor = await Actor.create({ name: "E2E 成长", type: "character" });
    await actor.createEmbeddedDocuments("Item", [{
      name: "侦查",
      type: "skill",
      system: {
        base: "25",
        adjustments: { personal: 0, occupation: 0, archetype: 0, experiencePackage: 0, experience: 0 },
        skillName: "侦查",
        specialization: "",
        properties: {},
        flags: { developement: true },
      },
    }]);
    return actor.id;
  });
  await openTidy(page, actorId);
  await clickTab(page, "growth");
  const button = page.locator('.c7t-row.is-growth-row button[data-action="developSkill"]');
  assert(await button.count(), "成长页未出现成长按钮");
  await button.click({ modifiers: ["Shift"] });
  await page.waitForTimeout(2500);
  const state = await page.evaluate((id) => {
    const actor = game.actors.get(id);
    const item = actor.items.find((entry) => entry.type === "skill");
    return {
      marked: Boolean(item?.system?.flags?.developement),
      history: (actor.getFlag("coc7-tidy-investigator", "growthHistory") ?? []).length,
      value: item?.value,
    };
  }, actorId);
  assert(!state.marked, "成长检定后应清除 developement 标记（7.24 传 uuid 会静默失败）");
  assert(state.history > 0, "成长检定后应写入成长历史");
  return state;
}

/* -------------------------------------------- */
/* 执行                                          */
/* -------------------------------------------- */

async function runLane(laneId) {
  const lane = LANES[laneId];
  if (!lane) throw new Error(`未知 lane：${laneId}`);
  ensureLane(lane);
  log(`\n=== ${laneId}: Foundry ${lane.core} + CoC7 ${lane.system} ===`);

  const server = await startLane(lane);
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: CHROME,
    args: ["--enable-unsafe-swiftshader", "--disable-gpu"],
  });
  const page = await newPage(browser);
  const errors = collectErrors(page);
  let laneFailed = false;

  try {
    await join(page, lane);
    await enableModule(page, lane);
    await page.waitForTimeout(1000);

    const moduleInfo = await page.evaluate((id) => {
      const module = game.modules.get(id);
      return { active: module?.active, version: module?.version, system: game.system.version, core: game.version };
    }, MODULE_ID);
    assert(moduleInfo.active, "模组未激活");
    log(`模组 ${moduleInfo.version} 已激活；Foundry ${moduleInfo.core} / CoC7 ${moduleInfo.system}`);

    const scenarios = [
      ["investigator", () => testInvestigator(page, lane, errors)],
      ["skill-edit", () => testSkillEdit(page, page.__actorId, errors)],
      ["weapon", () => testWeapon(page, lane, errors)],
      ["npc", () => testNpc(page, lane, errors)],
      ["npc-edit", () => testNpcEdit(page, lane, errors)],
      ["container", () => testContainer(page, lane, errors)],
      ["conditions", () => testConditions(page, lane, errors)],
      ["money", () => testMoney(page, lane, errors)],
      ["books", () => testBooks(page, lane, errors)],
      ["growth", () => testGrowth(page, lane, errors)],
      ["mythos", () => testMythosFlags(page, lane, errors)],
      ["settings", () => testSettings(page, lane, errors)],
      ["npc-rolls", () => testNpcRolls(page, lane, errors)],
      ["san-link", () => testSanLink(page, lane, errors)],
      ["import-st", () => testImportSt(page, lane, errors)],
    ];

    for (const [name, run] of scenarios) {
      if (only && name !== only) continue;
      try {
        if (name === "investigator") {
          const data = await run();
          page.__actorId = data.actorId;
          results.push({ lane: laneId, scenario: name, ok: true, data: { rows: data.rows, tabs: data.tabs } });
        } else if (name === "skill-edit") {
          if (!page.__actorId) throw new Error("缺少 investigator 场景的 actor");
          const data = await run();
          results.push({ lane: laneId, scenario: name, ok: true, data });
        } else if (name === "npc") {
          const data = await run();
          page.__npcActorId = await page.evaluate(() => game.actors.contents[0]?.id);
          results.push({ lane: laneId, scenario: name, ok: true, data });
        } else {
          const data = await run();
          results.push({ lane: laneId, scenario: name, ok: true, data });
        }
        log(`  ✅ ${name}`);
      } catch (error) {
        laneFailed = true;
        failures++;
        results.push({ lane: laneId, scenario: name, ok: false, error: error.message });
        log(`  ❌ ${name}: ${error.message}`);
        await page.screenshot({ path: path.join(CACHE, "artifacts", `${laneId}-${name}.png`) }).catch(() => {});
      }
    }

    if (laneId === "v13" && (!only || only === "legacy-prefer")) {
      try {
        const data = await testLegacyMigrationPrefer(page, lane, errors);
        results.push({ lane: laneId, scenario: "legacy-prefer", ok: true, data });
        log("  ✅ legacy-prefer");
      } catch (error) {
        laneFailed = true;
        failures++;
        results.push({ lane: laneId, scenario: "legacy-prefer", ok: false, error: error.message });
        log(`  ❌ legacy-prefer: ${error.message}`);
      }
    }

    if (laneId === "v13" && (!only || only === "legacy")) {
      try {
        const data = await testLegacySkill(page, lane, errors);
        results.push({ lane: laneId, scenario: "legacy", ok: true, data });
        log("  ✅ legacy");
      } catch (error) {
        laneFailed = true;
        failures++;
        results.push({ lane: laneId, scenario: "legacy", ok: false, error: error.message });
        log(`  ❌ legacy: ${error.message}`);
        await page.screenshot({ path: path.join(CACHE, "artifacts", `${laneId}-legacy.png`) }).catch(() => {});
      }
    }

    const fatal = errors.filter((line) => line.includes("PAGEERROR") || /coc7-tidy/i.test(line));
    assert(fatal.length === 0, `控制台出现模组相关错误：\n${fatal.slice(0, 8).join("\n")}`);
    log(`  控制台错误：${errors.length ? errors.slice(0, 5).join(" | ") : "无"}`);
  } finally {
    await browser.close();
    if (!keep) await stopLane(server);
  }
  return !laneFailed;
}

let ok = true;
for (const lane of lanes) {
  try {
    const laneOk = await runLane(lane);
    if (!laneOk) ok = false;
  } catch (error) {
    failures++;
    ok = false;
    console.error(`\n[${lane}] 执行失败：`, error);
  }
}

fs.mkdirSync(path.join(CACHE, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(CACHE, "artifacts", "results.json"), `${JSON.stringify(results, null, 2)}\n`);
log(`\n结果：${results.filter((r) => r.ok).length} 通过，${results.filter((r) => !r.ok).length} 失败`);
process.exit(ok ? 0 : 1);
