import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const suites = ["commentScanner.test.ts", "loadPrismWithQsp.test.ts"];

// Only the Obsidian loader is substituted; the production grammar uses real PrismJS.
const obsidianTestLoader = {
	name: "obsidian-test-loader",
	setup(builder) {
		builder.onResolve({ filter: /^obsidian$/ }, () => ({
			path: "obsidian",
			namespace: "obsidian-test-loader",
		}));
		builder.onLoad({ filter: /.*/, namespace: "obsidian-test-loader" }, () => ({
			contents: 'export const loadPrism = async () => require("prismjs");',
			loader: "js",
			resolveDir: root,
		}));
	},
};

let failed = 0;
console.log("Node regression suites (scanner and Prism tokens).");
console.log("Not included: highlightRanges.test.ts requires a native browser DOM; see CONTEXT.md section 12.");

for (const suite of suites) {
	console.log(`\nRunning ${suite}`);
	try {
		const bundle = await build({
			absWorkingDir: root,
			entryPoints: [suite],
			bundle: true,
			platform: "node",
			format: "cjs",
			target: "es2020",
			external: ["prismjs"],
			plugins: [obsidianTestLoader],
			write: false,
		});

		// Pipe the in-memory bundle to an isolated process and wait for async tests.
		const result = spawnSync(process.execPath, ["--input-type=commonjs"], {
			cwd: root,
			input: bundle.outputFiles[0].text,
			stdio: ["pipe", "inherit", "inherit"],
		});
		if (result.error) throw result.error;
		if (result.status !== 0) {
			throw new Error(result.signal
				? `Terminated by ${result.signal}`
				: `Exited with code ${result.status}`);
		}
		console.log(`PASS ${suite}`);
	} catch (error) {
		failed++;
		console.error(`FAIL ${suite}`, error);
	}
}

console.log(`\nNode suites: ${suites.length - failed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
