#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import { ScanCommand } from "./commands/scan.js";
import { ListCommand } from "./commands/list.js";
import { DeleteCommand } from "./commands/delete.js";
import { DefaultCommand } from "./commands/default.js";

const cli = meow(
  `
  Usage
    $ lenver [command]

  Commands
    scan     Scan project for env vars
    list     List stored env vars for this project
    delete   Delete a project by name or ID

  Options
    --include-sensitive  Include sensitive tier values in scan
    --show-values        Show actual values in list view
`,
  {
    importMeta: import.meta,
    flags: {
      includeSensitive: {
        type: "boolean",
        default: false,
      },
      showValues: {
        type: "boolean",
        default: false,
      },
    },
  }
);

const [command] = cli.input;

switch (command) {
  case "scan":
    render(<ScanCommand includeSensitive={cli.flags.includeSensitive} />);
    break;
  case "list":
    render(<ListCommand showValues={cli.flags.showValues} />);
    break;
  case "delete":
    render(<DeleteCommand />);
    break;
  case undefined:
  case "":
    render(<DefaultCommand />);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
