export const GITHUB_REPO = "hetpatel-11/Adobe_Premiere_Pro_MCP"
export const FALLBACK_STARS = 516
export const FALLBACK_FORKS = 106

export async function fetchRepoStats() {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}`,
    { headers: { Accept: "application/vnd.github+json" } },
  )
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}`)
  }
  const data = (await response.json()) as {
    stargazers_count?: number
    forks_count?: number
  }
  return {
    stars: data.stargazers_count ?? FALLBACK_STARS,
    forks: data.forks_count ?? FALLBACK_FORKS,
  }
}
