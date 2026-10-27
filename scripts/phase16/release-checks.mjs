import { execFileSync } from 'node:child_process';
/** Operator-only read of exact-commit GitHub checks; credential remains in memory. */
export async function releaseChecks(sha) {
    const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const credential = execFileSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const token = credential.split('\n').find(line => line.startsWith('password='))?.slice(9);
    if (!token)
        throw Error('GITHUB_OPERATOR_AUTH_REQUIRED');
    const base = 'https://api.github.com/repos/abhipatil1403/SYNAPSE-SIH2026';
    const api = async (path) => { const response = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' }, signal: AbortSignal.timeout(15000) }); if (!response.ok)
        throw Error('GITHUB_CHECKS_UNAVAILABLE'); return response.json(); };
    const pull = await api('/pulls/1'), checks = await api('/commits/' + sha + '/check-runs'), runs = await api('/actions/runs?head_sha=' + sha + '&per_page=10');
    return { head: pull.head.sha, localHead, checks: checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion })), runs: runs.workflow_runs.map(r => ({ id: r.id, status: r.status, conclusion: r.conclusion })) };
}
