# ralph.sh
# Usage: ./ralph.sh <iterations>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

PROMPT_FILE=".claude/prompts/ralph-prompt.txt"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: Prompt file not found at $PROMPT_FILE"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "=== Iteration $i/$1 ==="

  claude -p "$(cat "$PROMPT_FILE")" --permission-mode acceptEdits --allowedTools "Bash,Read,Edit,Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git commit:*)" | tee /tmp/claude_output.txt

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete, exiting."
    exit 0
  fi
done