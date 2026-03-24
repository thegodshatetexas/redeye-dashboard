import { execSync } from 'node:child_process'
import { auth } from '@/auth'
import { Octokit } from '@octokit/rest'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface PullRequest {
  repo: string
  number: number
  title: string
  url: string
  createdAt: string
  ageHours: number
  author: string
}

interface LinearIssue {
  id: string
  title: string
  project: string | null
  url: string
  state: string
  priority: number
}

interface ProjectsData {
  pullRequests: PullRequest[]
  linearIssues: LinearIssue[]
  errors: string[]
}

const REPOS = [
  { owner: 'thegodshatetexas', repo: 'dev-align' },
  { owner: 'thegodshatetexas', repo: 'concerts-redeye' },
  { owner: 'red-claw', repo: 'happy-hour' },
  { owner: 'red-claw', repo: 'car-mod-app' },
  { owner: 'red-claw', repo: 'redeye-dashboard' },
]

function getGithubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    return execSync('gh auth token', { encoding: 'utf8', timeout: 5000 }).trim()
  } catch {
    return undefined
  }
}

async function fetchPRs(token: string | undefined): Promise<{ prs: PullRequest[]; errors: string[] }> {
  const octokit = new Octokit({ auth: token })
  const prs: PullRequest[] = []
  const errors: string[] = []
  const now = Date.now()

  await Promise.allSettled(
    REPOS.map(async ({ owner, repo }) => {
      try {
        const { data } = await octokit.pulls.list({
          owner,
          repo,
          state: 'open',
          per_page: 10,
        })
        for (const pr of data) {
          const ageHours = Math.round((now - new Date(pr.created_at).getTime()) / 3600000)
          prs.push({
            repo: `${owner}/${repo}`,
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            createdAt: pr.created_at,
            ageHours,
            author: pr.user?.login ?? 'unknown',
          })
        }
      } catch (err) {
        errors.push(`GitHub ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  )

  prs.sort((a, b) => a.ageHours - b.ageHours)
  return { prs, errors }
}

async function fetchLinearIssues(): Promise<{ issues: LinearIssue[]; errors: string[] }> {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) return { issues: [], errors: ['LINEAR_API_KEY not set'] }

  const query = `
    query {
      issues(
        filter: {
          team: { key: { eq: "RED" } }
          state: { type: { in: ["started", "inProgress"] } }
        }
        first: 25
        orderBy: updatedAt
      ) {
        nodes {
          id
          title
          url
          priority
          state { name type }
          project { name }
        }
      }
    }
  `

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query }),
    })
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = json?.data?.issues?.nodes ?? []
    const issues: LinearIssue[] = nodes.map((n) => ({
      id: n.id,
      title: n.title,
      project: n.project?.name ?? null,
      url: n.url,
      state: n.state?.name ?? 'Unknown',
      priority: n.priority ?? 0,
    }))
    return { issues, errors: [] }
  } catch (err) {
    return { issues: [], errors: [`Linear: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

export async function GET(): Promise<NextResponse<ProjectsData | { error: string }>> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = getGithubToken()
  const [{ prs, errors: prErrors }, { issues, errors: linearErrors }] = await Promise.all([
    fetchPRs(token),
    fetchLinearIssues(),
  ])

  return NextResponse.json({
    pullRequests: prs,
    linearIssues: issues,
    errors: [...prErrors, ...linearErrors],
  })
}
