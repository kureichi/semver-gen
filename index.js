import { Octokit } from 'octokit'
import { parseArgs } from 'node:util'
import { Github } from './services/github.js'
import fs from 'fs'

const exit = (msg) => {
  throw new Error(msg)
}

let GITHUB_TOKEN
let OWNER
let REPO
let BRANCH
try {
  GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? exit('GITHUB_TOKEN is required')
  OWNER = process.env.OWNER ?? exit('OWNER is required')
  REPO = process.env.REPO ?? exit('REPO is required')
  BRANCH = process.env.BRANCH ?? exit('BRANCH is required')
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

const octokit = new Octokit({ auth: GITHUB_TOKEN })

const changelogsOptions = {
  'BREAKING CHANGES': {
    label: 'Breaking Changes ⚠',
    format: 'major'
  },
  feat: {
    label: 'Added',
    format: 'minor'
  },
  fix: {
    label: 'Fixed',
    format: 'patch'
  },
  refactor: {
    label: 'Changed',
    format: 'patch'
  },
  style: {
    label: 'UI Changed',
    format: 'patch'
  },
  docs: {
    label: "Documentation",
    format: 'patch'
  },
  chore: {
    label: 'Maintenance',
    format: 'patch'
  }
}
const github = new Github(octokit, {
  owner: OWNER,
  repoName: REPO,
  branchName: BRANCH,
  changelogsConfig: changelogsOptions
})

const options = {
  'get-tag': { type: 'boolean', short: 't' },
  'print-changelog': { type: 'boolean', short: 'c' }
}

const { values } = parseArgs({ options })

const generateChangelogsMD = async () => {
  const changeLogsObj = await github.generateChangelogsObj()
  const nextTag = await github.getNextTag()

  let changelogMD = ''

  changelogMD += `## Release ${nextTag} - ${new Date().toISOString().split('T')[0]}\n\n`
  Object.keys(changelogsOptions).forEach((ctx) => {
    const contextObj = changelogsOptions[ctx]
    const contextChangelogObj = changeLogsObj[ctx]
    if (!contextChangelogObj) return

    changelogMD += "### " + contextObj.label + "\n"

    let generalMessage = []
    contextChangelogObj.forEach((scopeObj) => {
      if (scopeObj.scope === 'general') {
        generalMessage = scopeObj.content
        return
      }

      changelogMD += `* ${scopeObj.scope}`
      if (scopeObj.content.length === 1) {
        changelogMD += `: ${scopeObj.content[scopeObj.content.length - 1]}\n`
      } else {
        changelogMD += "\n"
        scopeObj.content.forEach((message) => {
          changelogMD += `    * ${message}\n`
        })
      }
    })

    generalMessage.forEach((message) => {
      changelogMD += `* ${message}\n`
    })

    changelogMD += '\n'
  })

  console.log(changelogMD)
}

const generateNextTag = async () => {
  const nextTag = await github.getNextTag()
  console.log(nextTag)

  try {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `next_tag=${nextTag}\n`);
  } catch { null }
}

const main = async () => {
  if (values['get-tag']) await generateNextTag()
  if (values['print-changelog']) await generateChangelogsMD()
}

main()
