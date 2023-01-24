#!/usr/bin/env node

import { Diff } from "./diff";
import { Octokit } from "@octokit/rest";

const diff = new Diff(
    new Octokit({
        auth: process.env.GITHUB_TOKEN || "",
    })
);

diff.generate(
    "cs278",
    "test-composer",
    "master",
    "test-pr",
    "composer.json"
).then(function (diff) {
    console.log(diff);
});
