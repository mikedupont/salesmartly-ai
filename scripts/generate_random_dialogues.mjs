const scenarios = [
  {
    name: "work_fatigue",
    user: [
      "It's been a long day at work.",
      "My boss kept me late again.",
      "I just want to shut my brain off tonight.",
    ],
    assistant: [
      "That sounds exhausting. Try to give yourself a quiet break first.",
      "You've carried enough for one day. A calm evening would be good for you.",
      "Sounds heavy. You don't need to solve everything tonight.",
    ],
  },
  {
    name: "warm_checkin",
    user: [
      "Good morning.",
      "Just checking in.",
      "Hope your day is going well.",
    ],
    assistant: [
      "Good morning. Nice to hear from you.",
      "I'm glad you stopped by. How's your morning going?",
      "That was thoughtful of you. I hope your day starts smoothly too.",
    ],
  },
  {
    name: "light_flirt",
    user: [
      "You always know what to say.",
      "You're being a little charming today.",
      "I think you're trouble.",
    ],
    assistant: [
      "Maybe just a little. But only the harmless kind.",
      "Only when the conversation deserves it.",
      "Then we should probably keep talking and see how much trouble I can be.",
    ],
  },
  {
    name: "practical_decision",
    user: [
      "Should I move the meeting to tomorrow?",
      "I'm not sure which option is better.",
      "What do you think I should do?",
    ],
    assistant: [
      "If tomorrow gives you more space, that may be the safer choice.",
      "I'd lean toward the option with less pressure and fewer moving parts.",
      "The simpler path is probably the better one here.",
    ],
  },
  {
    name: "emotional_tension",
    user: [
      "I'm feeling off today.",
      "Something has been bothering me.",
      "I don't really want to get into it, but it's not great.",
    ],
    assistant: [
      "That's okay. We can keep it gentle and take it one step at a time.",
      "You don't have to force it. I'm here with you.",
      "Thanks for saying that. We can stay with the surface level for now.",
    ],
  },
];

const followUps = [
  "What happened next?",
  "Do you want to talk it through?",
  "Did that help at all?",
  "What would make tonight easier?",
  "How are you feeling now?",
  "Want to keep it light for a bit?",
];

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function buildDialogueTurn(scenario) {
  const user = pick(scenario.user);
  const assistant = pick(scenario.assistant);
  const followUp = Math.random() < 0.5 ? pick(followUps) : "";
  return { user, assistant, followUp };
}

function main() {
  const count = Math.max(1, Number(process.argv[2] || 5));
  const dialogs = [];
  for (let index = 0; index < count; index += 1) {
    const scenario = pick(scenarios);
    const turns = [];
    const rounds = 3 + Math.floor(Math.random() * 2);
    for (let round = 0; round < rounds; round += 1) {
      turns.push(buildDialogueTurn(scenario));
    }
    dialogs.push({
      id: `random_${String(index + 1).padStart(2, "0")}`,
      scenario: scenario.name,
      turns,
    });
  }

  console.log(JSON.stringify(dialogs, null, 2));
}

main();
