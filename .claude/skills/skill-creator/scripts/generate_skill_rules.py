#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml"]
# ///
"""
Skill Rules Generator - Generates skill-rules.json from SKILL.md files

This script scans all SKILL.md files in a skills directory and extracts
trigger configuration from the metadata.triggers field to generate a
consolidated skill-rules.json file.

Usage:
    generate_skill_rules.py --skills-dir <path> [--output <path>] [--validate]

Examples:
    generate_skill_rules.py --skills-dir .claude/skills
    generate_skill_rules.py --skills-dir .claude/skills --output .claude/skills/skill-rules.json
    generate_skill_rules.py --skills-dir .claude/skills --validate
"""

import sys
import re
import json
import argparse
from pathlib import Path
from typing import Any

import yaml


def extract_frontmatter(content: str) -> dict | None:
    """Extract YAML frontmatter from SKILL.md content."""
    if not content.startswith('---'):
        return None
    
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return None
    
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        return None


def validate_triggers(skill_name: str, triggers: dict) -> list[str]:
    """Validate trigger configuration and return list of errors."""
    errors = []
    
    # Validate type
    valid_types = {'domain', 'guardrail'}
    if 'type' in triggers and triggers['type'] not in valid_types:
        errors.append(f"{skill_name}: Invalid type '{triggers['type']}'. Must be one of: {valid_types}")
    
    # Validate enforcement
    valid_enforcements = {'suggest', 'warn', 'block'}
    if 'enforcement' in triggers and triggers['enforcement'] not in valid_enforcements:
        errors.append(f"{skill_name}: Invalid enforcement '{triggers['enforcement']}'. Must be one of: {valid_enforcements}")
    
    # Validate priority
    valid_priorities = {'critical', 'high', 'medium', 'low'}
    if 'priority' in triggers and triggers['priority'] not in valid_priorities:
        errors.append(f"{skill_name}: Invalid priority '{triggers['priority']}'. Must be one of: {valid_priorities}")
    
    # Validate keywords
    if 'keywords' in triggers:
        if not isinstance(triggers['keywords'], list):
            errors.append(f"{skill_name}: 'keywords' must be a list")
        elif not all(isinstance(k, str) for k in triggers['keywords']):
            errors.append(f"{skill_name}: All keywords must be strings")
    
    # Validate intentPatterns (must be valid regex)
    if 'intentPatterns' in triggers:
        if not isinstance(triggers['intentPatterns'], list):
            errors.append(f"{skill_name}: 'intentPatterns' must be a list")
        else:
            for i, pattern in enumerate(triggers['intentPatterns']):
                if not isinstance(pattern, str):
                    errors.append(f"{skill_name}: intentPatterns[{i}] must be a string")
                else:
                    try:
                        re.compile(pattern)
                    except re.error as e:
                        errors.append(f"{skill_name}: intentPatterns[{i}] is invalid regex: {e}")
    
    # Validate fileTriggers
    if 'fileTriggers' in triggers:
        ft = triggers['fileTriggers']
        if not isinstance(ft, dict):
            errors.append(f"{skill_name}: 'fileTriggers' must be an object")
        else:
            if 'pathPatterns' in ft:
                if not isinstance(ft['pathPatterns'], list):
                    errors.append(f"{skill_name}: 'fileTriggers.pathPatterns' must be a list")
            if 'pathExclusions' in ft:
                if not isinstance(ft['pathExclusions'], list):
                    errors.append(f"{skill_name}: 'fileTriggers.pathExclusions' must be a list")
            if 'contentPatterns' in ft:
                if not isinstance(ft['contentPatterns'], list):
                    errors.append(f"{skill_name}: 'fileTriggers.contentPatterns' must be a list")
                else:
                    for i, pattern in enumerate(ft['contentPatterns']):
                        try:
                            re.compile(pattern)
                        except re.error as e:
                            errors.append(f"{skill_name}: fileTriggers.contentPatterns[{i}] is invalid regex: {e}")
    
    # Guardrails require blockMessage
    if triggers.get('type') == 'guardrail' and triggers.get('enforcement') == 'block':
        if 'blockMessage' not in triggers:
            errors.append(f"{skill_name}: Guardrail skills with 'block' enforcement require 'blockMessage'")
    
    return errors


def build_skill_rule(triggers: dict, description: str) -> dict:
    """Build a skill rule entry from triggers configuration."""
    rule: dict[str, Any] = {
        'type': triggers.get('type', 'domain'),
        'enforcement': triggers.get('enforcement', 'suggest'),
        'priority': triggers.get('priority', 'medium'),
        'description': description,
    }
    
    # Build promptTriggers
    prompt_triggers: dict[str, Any] = {}
    if 'keywords' in triggers:
        prompt_triggers['keywords'] = triggers['keywords']
    if 'intentPatterns' in triggers:
        prompt_triggers['intentPatterns'] = triggers['intentPatterns']
    
    if prompt_triggers:
        rule['promptTriggers'] = prompt_triggers
    
    # Build fileTriggers
    if 'fileTriggers' in triggers:
        ft = triggers['fileTriggers']
        file_triggers: dict[str, Any] = {}
        if 'pathPatterns' in ft:
            file_triggers['pathPatterns'] = ft['pathPatterns']
        if 'pathExclusions' in ft:
            file_triggers['pathExclusions'] = ft['pathExclusions']
        if 'contentPatterns' in ft:
            file_triggers['contentPatterns'] = ft['contentPatterns']
        if 'createOnly' in ft:
            file_triggers['createOnly'] = ft['createOnly']
        if file_triggers:
            rule['fileTriggers'] = file_triggers
    
    # Add blockMessage for guardrails
    if 'blockMessage' in triggers:
        rule['blockMessage'] = triggers['blockMessage']
    
    # Add skipConditions
    if 'skipConditions' in triggers:
        rule['skipConditions'] = triggers['skipConditions']
    
    return rule


def scan_skills(skills_dir: Path) -> tuple[dict, list[str]]:
    """
    Scan skills directory and extract trigger configurations.
    
    Returns:
        Tuple of (skill_rules dict, list of errors)
    """
    skills: dict[str, Any] = {}
    errors: list[str] = []
    
    for skill_path in skills_dir.iterdir():
        if not skill_path.is_dir():
            continue
        
        skill_md = skill_path / 'SKILL.md'
        if not skill_md.exists():
            continue
        
        skill_name = skill_path.name
        content = skill_md.read_text()
        
        frontmatter = extract_frontmatter(content)
        if not frontmatter:
            # Silently skip skills with unparseable frontmatter if they don't have triggers
            continue
        
        # Check for triggers in metadata first
        metadata = frontmatter.get('metadata', {})
        if not isinstance(metadata, dict):
            continue
        
        triggers = metadata.get('triggers')
        if not triggers:
            continue  # Skill has no triggers configured, skip silently
        
        if not isinstance(triggers, dict):
            errors.append(f"{skill_name}: metadata.triggers must be an object")
            continue
        
        # Only validate name match for skills WITH triggers
        if frontmatter.get('name') != skill_name:
            errors.append(f"{skill_name}: Frontmatter name '{frontmatter.get('name')}' does not match directory name")
            continue
        
        # Validate triggers
        trigger_errors = validate_triggers(skill_name, triggers)
        errors.extend(trigger_errors)
        
        if trigger_errors:
            continue  # Skip skills with validation errors
        
        # Build skill rule
        description = frontmatter.get('description', '')
        skills[skill_name] = build_skill_rule(triggers, description)
    
    return skills, errors


def generate_skill_rules(skills_dir: Path, output_path: Path | None = None, validate_only: bool = False) -> bool:
    """
    Generate skill-rules.json from SKILL.md files.
    
    Args:
        skills_dir: Path to skills directory
        output_path: Path to output file (default: skills_dir/skill-rules.json)
        validate_only: If True, only validate without writing
    
    Returns:
        True if successful, False if errors occurred
    """
    if not skills_dir.exists():
        print(f"❌ Skills directory not found: {skills_dir}")
        return False
    
    print(f"📂 Scanning skills in: {skills_dir}")
    
    skills, errors = scan_skills(skills_dir)
    
    if errors:
        print("\n❌ Validation errors:")
        for error in errors:
            print(f"   • {error}")
        return False
    
    if not skills:
        print("⚠️  No skills with triggers found")
        return True
    
    # Build the full rules structure
    rules = {
        'version': '1.0',
        'description': 'Auto-generated skill activation triggers. Do not edit manually - regenerate with generate_skill_rules.py',
        'skills': skills,
    }
    
    print(f"\n✅ Found {len(skills)} skill(s) with triggers:")
    for name, rule in skills.items():
        keywords = rule.get('promptTriggers', {}).get('keywords', [])
        patterns = rule.get('promptTriggers', {}).get('intentPatterns', [])
        print(f"   • {name}: {len(keywords)} keywords, {len(patterns)} patterns")
    
    if validate_only:
        print("\n✅ Validation passed!")
        return True
    
    # Write output
    if output_path is None:
        output_path = skills_dir / 'skill-rules.json'
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(rules, f, indent=2)
        f.write('\n')
    
    print(f"\n✅ Generated: {output_path}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Generate skill-rules.json from SKILL.md files'
    )
    parser.add_argument(
        '--skills-dir',
        type=Path,
        required=True,
        help='Path to skills directory'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=None,
        help='Output path for skill-rules.json (default: skills-dir/skill-rules.json)'
    )
    parser.add_argument(
        '--validate',
        action='store_true',
        help='Only validate, do not write output'
    )
    
    args = parser.parse_args()
    
    success = generate_skill_rules(
        skills_dir=args.skills_dir.resolve(),
        output_path=args.output.resolve() if args.output else None,
        validate_only=args.validate
    )
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
