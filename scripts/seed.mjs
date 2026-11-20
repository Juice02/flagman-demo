// Creates the demo project and its two flags through the FlagMan API. Safe to run again:
// an existing project or flag with the same name/key is reused and left as it is.
// Usage: npm run seed   (FLAGMAN_API_URL overrides http://localhost:8081)
const API = process.env.FLAGMAN_API_URL || process.env.VITE_FLAGMAN_API_URL || 'http://localhost:8081'
const PROJECT = 'Book Logger demo'
const FLAGS = [
  { flagKey: 'dark-mode', friendlyName: 'Dark mode', description: 'Switches Book Logger to its dark theme.' },
  { flagKey: 'hide-non-fiction', friendlyName: 'Hide non-fiction', description: 'Hides non-fiction books from the list.' },
]

async function call(method, path, body) {
  let res
  try {
    res = await fetch(API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(`Can't reach FlagMan at ${API}. Run \`make up\` in ../flagman.`)
  }
  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    throw new Error(`${method} ${path}: ${problem?.detail ?? res.status}`)
  }
  return res.json()
}

try {
  let project = (await call('GET', '/projects')).find((p) => p.name === PROJECT)
  if (project) console.log(`Reusing project "${PROJECT}" (${project.projectId})`)
  else {
    project = await call('POST', '/projects', { name: PROJECT })
    console.log(`Created project "${PROJECT}" (${project.projectId})`)
  }

  const existing = (await call('GET', `/projects/${project.projectId}/flags`)).map((f) => f.flagKey)
  for (const flag of FLAGS) {
    if (existing.includes(flag.flagKey)) {
      console.log(`Flag ${flag.flagKey} exists, left unchanged`)
      continue
    }
    // FlagMan creates a disabled, 0% config with no rules in every environment.
    await call('POST', `/projects/${project.projectId}/flags`, flag)
    console.log(`Created flag ${flag.flagKey} (off, 0%, no rules in every environment)`)
  }

  console.log(`\nPut this in .env:\nVITE_FLAGMAN_PROJECT_ID=${project.projectId}`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
