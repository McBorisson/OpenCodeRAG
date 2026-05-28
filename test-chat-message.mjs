import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';
import { ragPlugin } from './dist/plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testChatMessage() {
  const logFilePath = `${__dirname}\\.opencode\\opencode-rag.log`;

  const log = (message) => {
    mkdirSync(`${__dirname}\\.opencode`, { recursive: true });
    appendFileSync(logFilePath, `[${new Date().toISOString()}] [test-chat-message] ${message}\n`, 'utf8');
  };

  log('🧪 Testing chat.message hook...\n');
  
  const input = {
    directory: __dirname,
  };

  const output = {
    parts: [
      {
        type: 'text',
        text: 'How does the chunking system work? What node types does the TypeScript chunker handle?',
      }
    ]
  };

  try {
    const hooks = await ragPlugin(input);
    
    if (!hooks['chat.message']) {
      log('❌ No chat.message hook found');
      process.exit(1);
    }

    log('✅ Plugin loaded successfully');
    log(`📝 Input query: "${output.parts[0].text}"\n`);
    
    await hooks['chat.message'](input, output);
    
    log(`\n📊 Output after plugin processing:\n`);
    log(`Total parts: ${output.parts.length}`);
    
    output.parts.forEach((part, i) => {
      if (part.type === 'text') {
        if (part.text.includes('Retrieved Code Context')) {
          log(`\n✅ Part ${i}: CODE CONTEXT APPENDED`);
          const lines = part.text.split('\n');
          lines.forEach(line => log('  ' + line));
        } else {
          log(`\nPart ${i}: Original query`);
          log(`  "${part.text}"`);
        }
      }
    });
    
    const contextPart = output.parts.find(p => p.text?.includes('Retrieved Code Context'));
    if (contextPart) {
      const contextLines = contextPart.text.split('\n');
      const fileRefs = contextLines.filter(l => l.includes('.ts') || l.includes('.js'));
      log(`\n📂 Retrieved file references: ${fileRefs.length}`);
      fileRefs.forEach(ref => log(`  ${ref}`));
    }
    
  } catch (err) {
    log(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

testChatMessage();
