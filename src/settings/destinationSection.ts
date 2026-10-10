import type SquidoPlugin from "../main";
import { APP_DISCOVERY_UNAVAILABLE, validateDestination, type CurrentDestination, type RepositoryChoice } from "../destinationDiscovery";

/** One implicit destination, staged locally until explicit save. Browsing never persists a parent path. */
export function renderDestinationSection(container: HTMLElement, plugin: SquidoPlugin): void {
  const settings = plugin.getSettings();
  const mode = settings.connectionMode;
  const discovery = plugin.getDestinationDiscovery();
  const section = container.createDiv({ cls: "squido-destination" });
  section.createEl("h3", { text: "Current publish destination" });
  section.createEl("p", { text: "Choose a destination or enter it manually. Changes apply only when you save. Browsing and failed loads never overwrite your saved destination. A new folder can be created by publishing a note." });
  const status = section.createEl("p", { attr: { role: "status", "aria-live": "polite", "aria-atomic": "true" } });
  const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [];
  const field = (label: string, value: string) => {
    const wrap = section.createEl("label", { cls: "squido-destination-field" });
    wrap.createSpan({ text: label });
    const input = wrap.createEl("input", { type: "text", value });
    input.setAttribute("aria-label", label); controls.push(input); return input;
  };
  const owner = field("Owner or organization", settings.owner);
  const repo = field("Repository", settings.repo);
  const branch = field("Branch", settings.branch);
  const folder = field("Target folder (exact path; empty means repository root)", settings.targetFolder);
  const destination = (): CurrentDestination => ({ owner: owner.value, repo: repo.value, branch: branch.value, targetFolder: folder.value });
  const picker = (label: string, select: (value: string) => void) => {
    const wrap = section.createEl("label", { cls: "squido-destination-field" }); wrap.createSpan({ text: label });
    const el = wrap.createEl("select"); el.setAttribute("aria-label", label); controls.push(el);
    el.addEventListener("change", () => select(el.value)); return el;
  };
  const options = (el: HTMLSelectElement, values: string[], prompt: string) => {
    el.empty(); el.createEl("option", { text: prompt, value: "" });
    for (const value of values) el.createEl("option", { text: value, value });
    el.value = "";
  };
  let repositories: RepositoryChoice[] = [];
  const accounts = picker("Accessible account / organization", (value) => {
    if (!value) return;
    owner.value = value; repo.value = ""; branch.value = ""; folder.value = "";
    options(repos, repositories.filter((item) => item.owner === value).map((item) => item.name), "Choose repository");
    options(branches, [], "Load branches for the selected repository"); options(folders, [], "Browse the target folder");
  });
  const repos = picker("Writable repositories", (value) => {
    const choice = repositories.find((item) => item.owner === owner.value && item.name === value);
    if (!choice) return;
    repo.value = choice.name; branch.value = choice.defaultBranch; folder.value = "";
    options(branches, [], "Load branches for the selected repository"); options(folders, [], "Browse repository root");
    status.textContent = "Repository selected in draft. Review branch and folder before saving.";
  });
  const branches = picker("Available branches", (value) => { if (value) { branch.value = value; options(folders, [], "Browse the target folder on this branch"); } });
  const folders = picker("Child folders of the entered target path", (value) => { if (value) { folder.value = value; options(folders, [], "Browse this folder to go deeper"); } });
  options(accounts, [], "Load accessible repositories first"); options(repos, [], "Choose account first");
  options(branches, [], "Load branches"); options(folders, [], "Browse folders");
  // A manual edit invalidates discovery choices rather than allowing stale choices to overwrite it.
  owner.addEventListener("input", () => { options(repos, [], "Reload repositories / choose account"); options(branches, [], "Load branches"); options(folders, [], "Browse folders"); });
  repo.addEventListener("input", () => { options(branches, [], "Load branches"); options(folders, [], "Browse folders"); });
  branch.addEventListener("input", () => options(folders, [], "Browse folders"));
  folder.addEventListener("input", () => options(folders, [], "Browse this path"));
  let busy = false;
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    busy = true; controls.forEach((control) => { control.disabled = true; }); section.setAttribute("aria-busy", "true"); status.textContent = "Working…";
    try { await task(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : "Destination operation failed. Your saved destination is unchanged."; }
    finally { busy = false; controls.forEach((control) => { control.disabled = false; }); section.setAttribute("aria-busy", "false"); }
  };
  const stillCurrent = () => {
    if (plugin.getSettings().connectionMode !== mode || !section.isConnected) throw new Error("Connection or view changed. Reopen destination settings and retry.");
  };
  const button = (label: string, task: () => Promise<void>) => {
    const el = section.createEl("button", { text: label }); el.type = "button"; controls.push(el);
    el.addEventListener("click", () => void run(task)); return el;
  };
  if (mode === "pat") {
    button("Load accessible repositories", async () => {
      repositories = await discovery.repositories(); stillCurrent();
      options(accounts, [...new Set(repositories.map((item) => item.owner))].sort(), "Choose account / organization");
      options(repos, [], "Choose account first"); options(branches, [], "Load branches"); options(folders, [], "Browse folders");
      status.textContent = repositories.length ? "Select an account, then a writable repository. Only PAT-accessible repositories with confirmed push permission are listed; branch rules can still block publishing." : "No writable repositories available. Check selected PAT repositories, Contents read/write and organization approval. Existing manual settings are unchanged.";
    });
    button("Load branches", async () => {
      const values = await discovery.branches(destination()); stillCurrent(); options(branches, values, "Choose branch");
      status.textContent = values.length ? "Branches loaded. Choose one or keep your manual branch." : "No branches found. The repository may be empty; create a branch on GitHub first.";
    });
    button("Browse target folder", async () => {
      const values = await discovery.folders(destination()); stillCurrent(); options(folders, values, "Choose child folder");
      status.textContent = values.length ? "Folder verified. Choose a child, then browse again to go deeper, or save this exact path." : "Folder verified; no child folders. Save this path or enter a new nested folder manually.";
    });
  } else status.textContent = APP_DISCOVERY_UNAVAILABLE;
  button("Save current destination", async () => {
    stillCurrent(); const next = destination(); validateDestination(next);
    await plugin.updateSettings({ ...plugin.getSettings(), ...next });
    status.textContent = "Current destination saved. The exact folder path will be restored after reload. Publishing still requires PAT mode and GitHub permission.";
  });
}
