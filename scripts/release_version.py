"""Choose a SemVer tag for a successfully deployed commit."""
import os
import re
import subprocess

VERSION = re.compile(r"^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def next_version(previous: str | None, messages: str) -> str:
    if previous is None:
        return "v1.0.0"
    match = VERSION.fullmatch(previous)
    if not match:
        raise ValueError("Expected a stable vMAJOR.MINOR.PATCH tag")
    major, minor, patch = map(int, match.groups())
    if re.search(r"^BREAKING[ -]CHANGE:\s*\S|^[a-z]+(?:\([^\n)]+\))?!:", messages, re.MULTILINE):
        return f"v{major + 1}.0.0"
    if re.search(r"^feat(?:\([^\n)]+\))?:", messages, re.MULTILINE):
        return f"v{major}.{minor + 1}.0"
    return f"v{major}.{minor}.{patch + 1}"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


def main() -> None:
    target = git("rev-parse", "HEAD")
    tags = [tag for tag in git("tag", "--list").splitlines() if VERSION.fullmatch(tag)]
    previous = max(tags, key=lambda tag: tuple(map(int, VERSION.fullmatch(tag).groups()))) if tags else None
    if previous:
        # Reruns and delayed older deployments must not create another release.
        if subprocess.run(["git", "merge-base", "--is-ancestor", target, previous]).returncode == 0:
            print("This commit already has a semantic release or is older than it.")
            return
        if subprocess.run(["git", "merge-base", "--is-ancestor", previous, target]).returncode != 0:
            raise SystemExit("Latest semantic tag is not an ancestor of the deployed commit")
    messages = git("log", "--format=%B", f"{previous}..{target}" if previous else target)
    tag = next_version(previous, messages)
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"tag={tag}\n")
    print(f"Next release: {tag}")


if __name__ == "__main__":
    main()
