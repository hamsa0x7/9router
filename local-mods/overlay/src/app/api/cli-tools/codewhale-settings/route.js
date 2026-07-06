"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

const PROVIDER_NAME = "CodeWhale";

const LEGACY_DIR_NAME = ".deepseek";
const PRIMARY_DIR_NAME = ".codewhale";

const getLegacyDir = () => path.join(os.homedir(), LEGACY_DIR_NAME);
const getPrimaryDir = () => path.join(os.homedir(), PRIMARY_DIR_NAME);

const getPrimaryConfigPath = () => path.join(getPrimaryDir(), "config.toml");
const getLegacyConfigPath = () => path.join(getLegacyDir(), "config.toml");


// Simple TOML parser for key = "value" and [section] patterns
const parseToml = (content) => {
    const result = {};
    let currentSection = result;

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) continue;

        // Section header: [section] or [section.subsection]
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            const sectionName = sectionMatch[1];
            if (!result[sectionName]) result[sectionName] = {};
            currentSection = result[sectionName];
            continue;
        }

        // Key = "value" or key = value
        const keyValueMatch = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
        if (keyValueMatch) {
            currentSection[keyValueMatch[1]] = keyValueMatch[2];
            continue;
        }

        // Key = value (unquoted)
        const unquotedMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
        if (unquotedMatch) {
            currentSection[unquotedMatch[1]] = unquotedMatch[2].trim();
        }
    }

    return result;
};

// Build TOML config for 9Router (CodeWhale openai provider mode)
const build9RouterConfig = (baseUrl, apiKey, model) => {
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    return `provider = "openai"

default_text_model = "${model}"

[providers.openai]
base_url = "${normalizedBaseUrl}"
api_key = "${apiKey}"
model = "${model}"
`;
};

// Default DeepSeek config (reset state)
const DEFAULT_CONFIG = `provider = "deepseek"
`;

const checkDeepSeekInstalled = async () => {
    try {
        const isWindows = os.platform() === "win32";
        const command = isWindows ? "where codewhale" : "which codewhale";
        await execAsync(command, { windowsHide: true });
        return true;
    } catch {
        try {
            try { await fs.access(getPrimaryConfigPath()); } catch { await fs.access(getLegacyConfigPath()); }
            return true;
        } catch {
            return false;
        }
    }
};

const readConfigToml = async () => {
    try {
        try { return await fs.readFile(getPrimaryConfigPath(), "utf-8"); } catch (e) { if (e.code === "ENOENT") return await fs.readFile(getLegacyConfigPath(), "utf-8"); throw e; }
    } catch (error) {
        if (error.code === "ENOENT") return "";
        throw error;
    }
};

const resolveConfigPath = async () => {
    try {
        await fs.access(getPrimaryConfigPath());
        return getPrimaryConfigPath();
    } catch {
        try {
            await fs.access(getLegacyConfigPath());
            return getLegacyConfigPath();
        } catch {
            return getPrimaryConfigPath();
        }
    }
};

// Detect 9Router by checking if provider is "openai" and base_url points to localhost/127.0.0.1
const has9RouterConfig = (config) => {
    if (!config) return false;
    const provider = config.provider;
    if (provider !== "openai") return false;
    const openaiSection = config["providers.openai"];
    if (!openaiSection?.base_url) return false;
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(openaiSection.base_url);
};

export async function GET() {
    try {
        const installed = await checkDeepSeekInstalled();
        if (!installed) {
            return NextResponse.json({ installed: false, settings: null, message: "CodeWhale is not installed" });
        }
        const toml = await readConfigToml();
        const config = parseToml(toml);
        const configPath = await resolveConfigPath();
        return NextResponse.json({
            installed: true,
            settings: config,
            has9Router: has9RouterConfig(config),
            configPath,
        });
    } catch (error) {
        console.log("Error checking CodeWhale settings:", error);
        return NextResponse.json({ error: "Failed to check CodeWhale settings" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { baseUrl, apiKey, model } = await request.json();
        if (!baseUrl || !model) {
            return NextResponse.json({ error: "baseUrl and model are required" }, { status: 400 });
        }

        const dir = getPrimaryDir();
        await fs.mkdir(dir, { recursive: true });

        const newConfig = build9RouterConfig(baseUrl, apiKey || "sk_9router", model);
        let targetPath = getPrimaryConfigPath(); try { await fs.access(getLegacyConfigPath()); try { await fs.access(getPrimaryConfigPath()); } catch { targetPath = getLegacyConfigPath(); } } catch {} await fs.writeFile(targetPath, newConfig);

        return NextResponse.json({
            success: true,
            message: "CodeWhale settings applied successfully!",
            configPath: targetPath,
        });
    } catch (error) {
        console.log("Error updating CodeWhale settings:", error);
        return NextResponse.json({ error: "Failed to update CodeWhale settings" }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        let configPath = getPrimaryConfigPath(); try { await fs.access(configPath); } catch { try { configPath = getLegacyConfigPath(); await fs.access(configPath); } catch { return NextResponse.json({ success: true, message: "No config file to reset" }); } }
        try {
            await fs.access(configPath);
        } catch {
            return NextResponse.json({ success: true, message: "No config file to reset" });
        }

        await fs.writeFile(configPath, DEFAULT_CONFIG);
        return NextResponse.json({ success: true, message: `${PROVIDER_NAME} config reset to DeepSeek defaults` });
    } catch (error) {
        console.log("Error resetting CodeWhale settings:", error);
        return NextResponse.json({ error: "Failed to reset CodeWhale settings" }, { status: 500 });
    }
}
