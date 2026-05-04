export class Github {
  constructor(octokit, { owner, repoName, branchName, changelogsConfig }) {
    this.octokit = octokit
    this.owner = owner
    this.repoName = repoName
    this.branchName = branchName
    this.changelogsConfig = changelogsConfig

    this.newTag = null
    this.base = null
    this.data = {
      latestTag: null,
      commits: null
    }
  }
  async fetch() {
    const { data } = await this.octokit.rest.repos.getLatestRelease({
      owner: this.owner,
      repo: this.repoName,
    })
    this.data.latestTag = data.tag_name

    const { data: data2 } = await this.octokit.rest.repos.compareCommitsWithBasehead({
      owner: this.owner,
      repo: this.repoName,
      basehead: `${this.data.latestTag}...${this.branchName}`
    })

    this.data.commits = data2
  }

  async getLatestTag() {
    if (!this.data.latestTag) {
      try {
        const { data } = await this.octokit.rest.repos.getLatestRelease({
          owner: this.owner,
          repo: this.repoName,
        })

        this.data.latestTag = data
      } catch {
        this.data.latestTag = ''
      }
    }

    return this.data.latestTag
  }

  async getCommitMessage() {
    const lastTag = await this.getLatestTag()

    let base = this.base ?? lastTag
    if (!this.data.commitMessages) {
      if (!base) {
        const allCommits = await this.octokit.paginate(this.octokit.rest.repos.listCommits, {
          owner: this.owner,
          repo: this.repoName,
        });
        const initialCommit = allCommits[allCommits.length - 1]
        base = initialCommit.sha;
      }

      const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead({
        owner: this.owner,
        repo: this.repoName,
        basehead: `${base}...${this.branchName}`
      })
      this.data.commits = data.commits
      this.base = base
    }

    const messages = this.data.commits.map(c => {
      const authorMD = c.author ? `[@${c.author.login}](https://github.com/${c.author.login})` : ''

      const firstLine = c.commit.message.split('\n')[0]
      const match = firstLine.match(/^(\w+)(?:\((.+)\))?: (.+)$/)

      if (match) {
        const matchMessage = match[3].match(/^(.+?)(?:\s\((#\d+)\))?$/);
        const message = `[${matchMessage[1].charAt(0).toUpperCase() + matchMessage[1].slice(1)}](${c.html_url})${matchMessage[2] ? ` (${matchMessage[2]})` : ''}`

        return {
          type: match[1],
          scope: match[2],
          message: `${message}${authorMD ? ` By ${authorMD}` : ''}`,
        }
      }
      else {
        return
      }
    })

    return messages
  }

  async generateChangelogsObj() {
    const commitMessages = await this.getCommitMessage()
    const changelogsObj = {}

    commitMessages.forEach((m) => {
      if (!m) return

      const scope = m.scope || "general"

      if (!changelogsObj[m.type]) changelogsObj[m.type] = []

      let scopeObj = changelogsObj[m.type]?.filter((n) => n.scope === scope).pop()
      if (!scopeObj) scopeObj = {
        scope: scope,
        content: []
      }
      const message = m.message.charAt(0).toUpperCase() + m.message.slice(1)
      scopeObj.content.push(message)
      scopeObj.content = scopeObj.content.sort()

      const cleaned = changelogsObj[m.type]?.filter(n => n.scope !== scope)
      changelogsObj[m.type] = [...cleaned, scopeObj]
    })

    return changelogsObj
  }

  async getNextTag() {
    if (this.newTag) return this.newTag

    const changeLogsObj = await this.generateChangelogsObj()
    const latestTag = await this.getLatestTag()
    if (!latestTag) {
      return 'v1.0.0'
    }

    const latestVersion = (await this.getLatestTag()).slice(1).split('.')
    const search = (keySearch) => {
      let isFound = false

      Object.keys(changeLogsObj).forEach(key => {
        if (key === keySearch) {
          isFound = true
        }
      })

      return isFound
    }

    let newVersion
    const result = {
      major: false,
      minor: false,
      patch: false
    }
    Object.keys(this.changelogsConfig).forEach(context => {
      const contextObj = this.changelogsConfig[context]

      if (search(context + "!")) {
        result.major = true
      }

      if (search(context)) {
        if (contextObj.format === 'major') result.major = true
        else if (contextObj.format === 'minor') result.minor = true
        else if (contextObj.format === 'patch') result.patch = true
      }
    })

    if (result.major) newVersion = [parseInt(latestVersion[0]) + 1, latestVersion[1], latestVersion[2]]
    else if (result.minor) newVersion = [latestVersion[0], parseInt(latestVersion[1]) + 1, latestVersion[2]]
    else if (result.patch) newVersion = [latestVersion[0], latestVersion[1], parseInt(latestVersion[2]) + 1]

    return `v${newVersion.join('.')}`
  }
}
