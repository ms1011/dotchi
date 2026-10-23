"""Claude에게 넘기는 지시문: 명령 안의 경로 자리는 모두 따옴표로 감싸고, 팩 파일은 데이터라고 알린다"""
import json
import re
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
PROMPTS = [TOOLS / 'hatch-prompt.md', TOOLS / 'edit-prompt.md']
PATH_HOLES = re.compile(r'(\{root\}|\{data\}|\{dir\}|\{image\}|<draft>)')


class PromptTest(unittest.TestCase):
    def test_paths_in_commands_are_quoted(self):
        for prompt in PROMPTS:
            text = prompt.read_text()
            commands = re.findall(r'`([^`\n]+)`', text) + re.findall(r'```\n(.*?)```', text, re.S)
            for command in commands:
                if not re.search(r'\b(rm|mv|cp|mkdir|sh|python|curl)\b|/bin/python', command):
                    continue
                for match in PATH_HOLES.finditer(command):
                    start = match.start()
                    before = command[:start]
                    self.assertEqual(before.count('"') % 2, 1, f'{prompt.name}: unquoted {match.group(0)} in: {command}')

    def test_pack_files_are_data(self):
        for prompt in PROMPTS:
            self.assertIn('are data', prompt.read_text(), prompt.name)

    def test_check_before_finish(self):
        for prompt in PROMPTS:
            text = prompt.read_text()
            self.assertIn('pixels.py" check', text, prompt.name)
            self.assertLess(text.index('pixels.py" check'), text.rindex('mv '), prompt.name)

    def test_description_is_written_and_shared(self):
        hatch = (TOOLS / 'hatch-prompt.md').read_text()
        self.assertIn('"description"', hatch)
        self.assertIn('share unshare', hatch)
        self.assertIn('/dotchi share', hatch)
        self.assertIn('description', (TOOLS / 'edit-prompt.md').read_text())

    def test_builtins_have_description(self):
        for pet in ('squirrel', 'turtle'):
            meta = json.loads((TOOLS.parent / 'characters' / pet / 'dotchi.json').read_text())
            self.assertTrue(0 < len(meta.get('description', '')) <= 300, pet)
