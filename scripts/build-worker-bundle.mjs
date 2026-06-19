import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/make/Documents/salesmartly";
const SRC_DIR = path.join(ROOT, "src");
const OUT_FILE = path.join(ROOT, "dist", "salesmartly-ai.worker.bundle.mjs");

function resolveSpec(fromId, spec) {
  if (!spec.startsWith(".")) return spec;
  const fromDir = path.posix.dirname(fromId);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));
  return joined.startsWith("./") || joined.startsWith("../") ? joined : `./${joined}`;
}

function parseImportSpecifiers(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error(`Unsupported import form: ${raw}`);
  }
  const inner = trimmed.replace(/^\{/, "").replace(/\}$/, "");
  return inner
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (aliasMatch) {
        return { imported: aliasMatch[1], local: aliasMatch[2] };
      }
      return { imported: part, local: part };
    });
}

function transformModule(source, id) {
  const exports = new Set();
  const reexports = [];

  source = source.replace(/^\s*import\b[\s\S]*?;\s*$/gm, (statement) => {
    const match = statement.match(/^import\b\s+([\s\S]*?)\s+from\s+["'](.+?)["'];?\s*$/m);
    if (!match) {
      throw new Error(`Unsupported import in ${id}: ${statement}`);
    }
    const specifiers = parseImportSpecifiers(match[1]);
    const spec = match[2];
    const lines = specifiers.map(({ imported, local }) => {
      if (imported === local) {
        return `const ${local} = require(${JSON.stringify(spec)}).${imported};`;
      }
      return `const ${local} = require(${JSON.stringify(spec)}).${imported};`;
    });
    return lines.join("\n");
  });

  source = source.replace(/^\s*export\b\s+\{[\s\S]*?\}\s+from\s+["'](.+?)["'];\s*$/gm, (statement) => {
    const match = statement.match(/^export\b\s+\{([\s\S]*?)\}\s+from\s+["'](.+?)["'];\s*$/m);
    if (!match) {
      throw new Error(`Unsupported re-export in ${id}: ${statement}`);
    }
    const specifiers = parseImportSpecifiers(`{${match[1]}}`);
    reexports.push({ spec: match[2], specifiers });
    return "";
  });

  source = source.replace(/^\s*export\b\s+default\s+/gm, "module.exports.default = ");

  source = source.replace(/^\s*export\b\s+(async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm, (statement, asyncPart = "", name) => {
    exports.add(name);
    return `${asyncPart || ""}function ${name}(`;
  });

  source = source.replace(/^\s*export\b\s+(const|let|var)\s+([A-Za-z0-9_$]+)\s*=/gm, (statement, kind, name) => {
    exports.add(name);
    return `${kind} ${name} =`;
  });

  source = source.replace(/^\s*export\b\s+\{\s*([A-Za-z0-9_$,\s]+)\s*\};?\s*$/gm, (statement, names) => {
    names
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => exports.add(name));
    return "";
  });

  const exportLines = [];
  for (const name of exports) {
    exportLines.push(`exports.${name} = ${name};`);
  }
  for (const { spec, specifiers } of reexports) {
    const tempName = `__reexport_${Math.random().toString(36).slice(2, 8)}`;
    exportLines.push(`const ${tempName} = require(${JSON.stringify(spec)});`);
    for (const { imported, local } of specifiers) {
      exportLines.push(`exports.${local} = ${tempName}.${imported};`);
    }
  }

  return `${source.trim()}\n${exportLines.length ? `\n${exportLines.join("\n")}\n` : ""}`;
}

function readSourceFiles() {
  return fs
    .readdirSync(SRC_DIR)
    .filter((file) => file.endsWith(".js"))
    .sort()
    .map((file) => path.posix.join("src", file));
}

function buildBundle() {
  const ids = readSourceFiles();
  const moduleDefs = [];

  for (const id of ids) {
    const abs = path.join(ROOT, id);
    const source = fs.readFileSync(abs, "utf8");
    const transformed = transformModule(source, id);
    moduleDefs.push(`__define(${JSON.stringify(id)}, function(module, exports, require) {\n${transformed}\n});`);
  }

  const bundle = `const __modules = Object.create(null);\nconst __cache = Object.create(null);\nfunction __define(id, factory) {\n  __modules[id] = factory;\n}\nfunction __normalizePath(input) {\n  const parts = [];\n  for (const part of input.split("/")) {\n    if (!part || part === ".") continue;\n    if (part === "..") {\n      if (parts.length) parts.pop();\n      continue;\n    }\n    parts.push(part);\n  }\n  return parts.join("/");\n}\nfunction __resolve(fromId, spec) {\n  if (!spec.startsWith(".")) return spec;\n  const fromDir = fromId.split("/").slice(0, -1).join("/");\n  return __normalizePath(\`\${fromDir}/\${spec}\`);\n}\nfunction __require(spec, fromId) {\n  const id = __resolve(fromId, spec);\n  if (__cache[id]) {\n    return __cache[id].exports;\n  }\n  const factory = __modules[id];\n  if (!factory) {\n    throw new Error(\`Module not found: \${id} (imported from \${fromId})\`);\n  }\n  const module = { exports: {} };\n  __cache[id] = module;\n  factory(module, module.exports, (childSpec) => __require(childSpec, id));\n  return module.exports;\n}\n${moduleDefs.join("\n\n")}\n\nexport default __require("./worker.js", "src/worker.js").default;\n`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, bundle, "utf8");
  return OUT_FILE;
}

const out = buildBundle();
console.log(out);
