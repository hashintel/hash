# Claude Code Instructions

This file contains instructions and preferences for Claude Code when working with this repository.

## PR Review Guidelines

When reviewing Pull Requests, Claude should:

1. **Always check PR comments**: Analyze both general PR comments and code review comments to understand:
   - Discussions between the PR author and reviewers
   - Known issues or technical trade-offs
   - Implementation reasoning
   - Plans for future improvements
   - Specific reviewer concerns or suggestions

2. **Check PR comments using**:
   - `gh pr view <PR_NUMBER> --comments` to get the general conversation
   - `gh api repos/hashintel/hash/pulls/<PR_NUMBER>/comments` to get code-specific review comments

3. **Include comment context** in reviews to provide more comprehensive analysis of the PR.

## Branch-Specific Working Memory

The `.claude/working-memory/` directory stores branch-specific context that persists across sessions. These files are added to `.gitignore` and should never be committed to the repository.

When working on a feature branch:

1. **Check current branch and verify feature branch**: At the beginning of a session, verify the current branch:

   ```bash
   # Determine current branch
   CURRENT_BRANCH=$(git branch --show-current)
   
   # Alert if on main branch
   if [ "$CURRENT_BRANCH" = "main" ]; then
     echo "⚠️ IMPORTANT: You are currently on the main branch which is protected."
     echo "Direct commits to main are not possible - changes must be made through Pull Requests."
     echo "Create a feature branch with 'git checkout -b feature/your-feature-name' before making changes."
     # Don't maintain branch memory for main
     return
   fi
   ```

2. **Always check for branch-specific memory**: For feature branches, check if branch-specific memory exists and load all relevant files:

   ```bash
   # Check if branch-specific memory exists
   MEMORY_DIR=".claude/working-memory/$CURRENT_BRANCH"
   if [ -d "$MEMORY_DIR" ]; then
     echo "Loading branch-specific memory for '$CURRENT_BRANCH':"
     
     # Read main context file
     if [ -f "$MEMORY_DIR/CLAUDE.md" ]; then
       echo -e "\n=== BRANCH CONTEXT ===\n"
       cat "$MEMORY_DIR/CLAUDE.md"
     fi
     
     # Read TODOs
     if [ -f "$MEMORY_DIR/TODOS.md" ]; then
       echo -e "\n=== PENDING TASKS ===\n"
       cat "$MEMORY_DIR/TODOS.md"
     fi
     
     # Read decisions
     if [ -f "$MEMORY_DIR/DECISIONS.md" ]; then
       echo -e "\n=== KEY DECISIONS ===\n"
       cat "$MEMORY_DIR/DECISIONS.md"
     fi
   fi
   ```

3. **Maintain branch-specific memory**: As you work on tasks, proactively update the branch memory with:
   - Key implementation decisions
   - Pending TODOs
   - Details that would be useful in future sessions
   - Important file locations and relationships

4. **Create memory files if they don't exist**: If working on a feature branch without memory files, suggest creating them:

   ```bash
   # Create directory structure
   mkdir -p ".claude/working-memory/$CURRENT_BRANCH"
   
   # Create initial files
   touch ".claude/working-memory/$CURRENT_BRANCH/CLAUDE.md"
   touch ".claude/working-memory/$CURRENT_BRANCH/TODOS.md"
   touch ".claude/working-memory/$CURRENT_BRANCH/DECISIONS.md"
   ```
