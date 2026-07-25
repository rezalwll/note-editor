import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const unixOnly = process.platform === "win32" ? describe.skip : describe;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

unixOnly("deploy archive", () => {
  async function createRepository(options: { includeDeployScript?: boolean } = {}) {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), "notava-deploy-source-"));
    temporaryDirectories.push(sourceDirectory);
    const scriptsDirectory = path.join(sourceDirectory, "scripts");
    await mkdir(scriptsDirectory, { recursive: true });
    await copyFile(
      path.resolve("scripts/create-deploy-archive.sh"),
      path.join(scriptsDirectory, "create-deploy-archive.sh"),
    );
    await writeFile(path.join(sourceDirectory, "package.json"), '{"name":"fixture"}');
    if (options.includeDeployScript !== false) {
      await writeFile(path.join(scriptsDirectory, "deploy-notebook.sh"), "#!/usr/bin/env bash\n");
    }
    await writeFile(
      path.join(sourceDirectory, ".gitignore"),
      ".env*\nnode_modules/\nuploads/\n*.tgz\n*.log\n*.tsbuildinfo\n",
    );
    execFileSync("git", ["init", "--quiet"], { cwd: sourceDirectory });
    execFileSync("git", ["config", "user.email", "tests@example.invalid"], {
      cwd: sourceDirectory,
    });
    execFileSync("git", ["config", "user.name", "Deploy Archive Tests"], {
      cwd: sourceDirectory,
    });
    execFileSync("git", ["add", "."], { cwd: sourceDirectory });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: sourceDirectory });
    return sourceDirectory;
  }

  it("archives the committed release without local files or self-inclusion", async () => {
    const sourceDirectory = await createRepository();
    await Promise.all([
      mkdir(path.join(sourceDirectory, "node_modules", "dependency"), { recursive: true }),
      mkdir(path.join(sourceDirectory, "uploads"), { recursive: true }),
      writeFile(path.join(sourceDirectory, ".env"), "SESSION_SECRET=never-archive-this"),
      writeFile(path.join(sourceDirectory, "server.log"), "private log"),
      writeFile(path.join(sourceDirectory, "cache.tsbuildinfo"), "cache"),
      writeFile(path.join(sourceDirectory, "untracked.txt"), "not a committed release file"),
    ]);
    await Promise.all([
      writeFile(
        path.join(sourceDirectory, "node_modules", "dependency", "index.js"),
        "module.exports = true;",
      ),
      writeFile(path.join(sourceDirectory, "uploads", "private.txt"), "private upload"),
    ]);

    const scriptPath = path.join(sourceDirectory, "scripts", "create-deploy-archive.sh");
    const outputDirectory = path.join(sourceDirectory, "deploy output");
    await mkdir(outputDirectory);
    const archivePath = path.join(outputDirectory, "notebook deploy.tgz");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync("bash", [scriptPath, archivePath], {
        cwd: sourceDirectory,
        encoding: "utf8",
        env: { ...process.env, TMPDIR: sourceDirectory },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).not.toContain("file changed as we read it");
    }

    const entries = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .map((entry) => entry.replace(/^\.\//, ""));

    expect(entries).toContain("package.json");
    expect(entries).toContain("scripts/deploy-notebook.sh");
    expect(entries).not.toContain("deploy output/notebook deploy.tgz");
    expect(entries).not.toContain(".env");
    expect(entries).not.toContain("untracked.txt");
    expect(entries.some((entry) => entry.startsWith(".git/"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("node_modules/"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("uploads/"))).toBe(false);
    expect(entries.some((entry) => entry.endsWith(".log"))).toBe(false);
    expect(entries.some((entry) => entry.endsWith(".tsbuildinfo"))).toBe(false);
  });

  it("preserves the last good artifact when validation fails", async () => {
    const sourceDirectory = await createRepository({ includeDeployScript: false });
    const scriptPath = path.join(sourceDirectory, "scripts", "create-deploy-archive.sh");
    const archivePath = path.join(sourceDirectory, "notebook-deploy.tgz");
    await writeFile(archivePath, "last-good-artifact");

    const result = spawnSync("bash", [scriptPath, archivePath], {
      cwd: tmpdir(),
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Deploy archive is missing required entry: scripts/deploy-notebook.sh",
    );
    await expect(readFile(archivePath, "utf8")).resolves.toBe("last-good-artifact");
  });
});

describe("deploy workflow", () => {
  it("deploys only successful pushes from this repository and does not mask failures", async () => {
    const workflow = await readFile(path.resolve(".github/workflows/deploy.yml"), "utf8");

    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository",
    );
    expect(workflow).toContain('${RUNNER_TEMP}/notebook-deploy.tgz');
    expect(workflow).toContain("DOMAIN_ALIASES='www.${{ secrets.PROD_DOMAIN }}'");
    expect(workflow).not.toContain("DEPLOY_ARCHIVE: ${{ runner.temp }}");
    expect(workflow).toContain(
      "(systemctl disable --now notebook-auto-deploy.timer >/dev/null 2>&1 || true)",
    );
    expect(workflow).not.toMatch(/bash \/root\/deploy-notebook\.sh && \\\n\s*systemctl[^\n]+\|\| true/);
  });

  it("preserves a usable TLS certificate and provisions new certificates without editing nginx", async () => {
    const deployScript = await readFile(
      path.resolve("scripts/deploy-notebook.sh"),
      "utf8",
    );

    expect(deployScript).toContain("certificate_is_usable()");
    expect(deployScript).toContain("certificate_is_currently_valid()");
    expect(deployScript).toContain("openssl x509 -checkend 86400");
    expect(deployScript).toContain("openssl x509 -checkend 0");
    expect(deployScript).toContain("openssl x509 -checkhost");
    expect(deployScript).toContain("install_nginx_candidate");
    expect(deployScript).toContain("certbot certonly");
    expect(deployScript).toContain("--webroot-path /var/www/html");
    expect(deployScript).not.toContain("certbot --nginx");
    expect(deployScript).toContain(
      'runuser -u "${APP_USER}" -- env HOME="${APP_USER_HOME}" pm2 restart notebook --update-env',
    );
  });
});
