/**
 * Modern Standard Calculator
 * Features: High-precision arithmetic, calculation history, keyboard navigation,
 * sound feedback (Web Audio API), theme switching, clipboard copying.
 */

class SoundEffects {
  constructor() {
    this.enabled = localStorage.getItem('calc_sound') === 'true';
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('calc_sound', this.enabled);
    return this.enabled;
  }

  playClick(type = 'default') {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;

      if (type === 'operator') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
      } else if (type === 'equals') {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.06);
      } else {
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);
      }

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // AudioContext unavailable or blocked by autoplay policy
    }
  }
}

class Calculator {
  constructor(previousOperandEl, currentOperandEl, historyListEl) {
    this.previousOperandEl = previousOperandEl;
    this.currentOperandEl = currentOperandEl;
    this.historyListEl = historyListEl;

    this.sound = new SoundEffects();
    this.history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    this.justCalculated = false;

    this.clear();
    this.renderHistory();
  }

  clear() {
    this.currentOperand = '0';
    this.previousOperand = '';
    this.operation = undefined;
    this.justCalculated = false;
    this.updateDisplay();
  }

  delete() {
    if (this.justCalculated) {
      this.clear();
      return;
    }
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') {
      this.clear();
      return;
    }
    if (this.currentOperand.length === 1 || (this.currentOperand.length === 2 && this.currentOperand.startsWith('-'))) {
      this.currentOperand = '0';
    } else {
      this.currentOperand = this.currentOperand.slice(0, -1);
    }
    this.updateDisplay();
  }

  appendNumber(number) {
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0' || this.justCalculated) {
      this.currentOperand = '';
      this.justCalculated = false;
    }

    if (number === '.' && this.currentOperand.includes('.')) return;
    if (this.currentOperand === '0' && number !== '.') {
      this.currentOperand = number.toString();
    } else if (this.currentOperand === '' && number === '.') {
      this.currentOperand = '0.';
    } else {
      // Limit to 15 digits to avoid display overflowing
      if (this.currentOperand.replace(/[^0-9]/g, '').length >= 15) return;
      this.currentOperand += number.toString();
    }
    this.updateDisplay();
  }

  chooseOperation(operation) {
    if (this.currentOperand === 'Error' || this.currentOperand === 'Cannot divide by 0') return;

    if (this.currentOperand === '' && this.previousOperand !== '') {
      this.operation = operation;
      this.updateDisplay();
      return;
    }

    if (this.previousOperand !== '') {
      this.compute(false);
    }

    this.operation = operation;
    this.previousOperand = this.currentOperand;
    this.currentOperand = '';
    this.justCalculated = false;
    this.updateDisplay();
  }

  toggleSign() {
    if (this.currentOperand === '0' || this.currentOperand === '' || this.currentOperand === 'Error') return;
    if (this.currentOperand.startsWith('-')) {
      this.currentOperand = this.currentOperand.slice(1);
    } else {
      this.currentOperand = '-' + this.currentOperand;
    }
    this.updateDisplay();
  }

  percentage() {
    if (this.currentOperand === '' || this.currentOperand === 'Error') return;
    const current = parseFloat(this.currentOperand);
    if (isNaN(current)) return;

    // If an operation is in progress, calculate percentage relative to previousOperand
    if (this.previousOperand && this.operation) {
      const prev = parseFloat(this.previousOperand);
      if (!isNaN(prev)) {
        if (this.operation === '+' || this.operation === '−') {
          this.currentOperand = this.formatSafeNumber((prev * current) / 100);
        } else {
          this.currentOperand = this.formatSafeNumber(current / 100);
        }
        this.updateDisplay();
        return;
      }
    }

    this.currentOperand = this.formatSafeNumber(current / 100);
    this.updateDisplay();
  }

  formatSafeNumber(num) {
    // Avoid floating point precision issues like 0.1 + 0.2 = 0.30000000000000004
    if (Number.isInteger(num)) return num.toString();
    const precisionFixed = parseFloat(num.toPrecision(12));
    return precisionFixed.toString();
  }

  compute(isFinal = true) {
    let computation;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);

    if (isNaN(prev) || isNaN(current)) return;

    switch (this.operation) {
      case '+':
        computation = prev + current;
        break;
      case '−':
      case '-':
        computation = prev - current;
        break;
      case '×':
      case '*':
        computation = prev * current;
        break;
      case '÷':
      case '/':
        if (current === 0) {
          this.currentOperand = 'Cannot divide by 0';
          this.previousOperand = '';
          this.operation = undefined;
          this.updateDisplay();
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    const expressionStr = `${this.formatDisplayNumber(this.previousOperand)} ${this.operation} ${this.formatDisplayNumber(this.currentOperand)}`;
    const formattedResult = this.formatSafeNumber(computation);

    if (isFinal) {
      this.addHistory(expressionStr, formattedResult);
      this.previousOperand = '';
      this.operation = undefined;
      this.currentOperand = formattedResult;
      this.justCalculated = true;
    } else {
      this.currentOperand = formattedResult;
    }

    this.updateDisplay();
  }

  formatDisplayNumber(numberStr) {
    if (!numberStr || numberStr === 'Error' || numberStr === 'Cannot divide by 0') {
      return numberStr;
    }
    const [integerPart, decimalPart] = numberStr.split('.');
    const isNegative = integerPart.startsWith('-');
    const cleanInteger = isNegative ? integerPart.slice(1) : integerPart;

    const integerDisplay = isNaN(parseFloat(cleanInteger))
      ? ''
      : parseFloat(cleanInteger).toLocaleString('en-US');

    const prefix = isNegative ? '-' : '';

    if (decimalPart != null) {
      return `${prefix}${integerDisplay}.${decimalPart}`;
    }
    return `${prefix}${integerDisplay}`;
  }

  updateDisplay() {
    this.currentOperandEl.textContent = this.formatDisplayNumber(this.currentOperand) || '0';

    if (this.operation != null && this.previousOperand !== '') {
      this.previousOperandEl.textContent = `${this.formatDisplayNumber(this.previousOperand)} ${this.operation}`;
    } else {
      this.previousOperandEl.textContent = '';
    }

    // Dynamic font resizing for long numbers
    const len = this.currentOperand.length;
    if (len > 12) {
      this.currentOperandEl.style.fontSize = '1.6rem';
    } else if (len > 8) {
      this.currentOperandEl.style.fontSize = '2rem';
    } else {
      this.currentOperandEl.style.fontSize = '2.5rem';
    }

    // Highlight active operator button
    document.querySelectorAll('.btn-operator').forEach((btn) => {
      if (this.operation && btn.dataset.operation === this.operation && this.currentOperand === '') {
        btn.classList.add('active-op');
      } else {
        btn.classList.remove('active-op');
      }
    });
  }

  addHistory(expression, result) {
    const item = {
      expression,
      result,
      timestamp: Date.now()
    };
    this.history.unshift(item);
    if (this.history.length > 30) this.history.pop();
    localStorage.setItem('calc_history', JSON.stringify(this.history));
    this.renderHistory();
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem('calc_history');
    this.renderHistory();
  }

  renderHistory() {
    if (!this.historyListEl) return;
    if (this.history.length === 0) {
      this.historyListEl.innerHTML = '<div class="empty-history">No calculations yet</div>';
      return;
    }

    this.historyListEl.innerHTML = this.history
      .map(
        (item, index) => `
        <div class="history-item" data-index="${index}" title="Click to use this result">
          <span class="history-item-expr">${item.expression} =</span>
          <span class="history-item-res">${item.result}</span>
        </div>
      `
      )
      .join('');

    // Attach click listeners to recall history result
    this.historyListEl.querySelectorAll('.history-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const index = parseInt(itemEl.dataset.index, 10);
        const item = this.history[index];
        if (item) {
          this.currentOperand = item.result;
          this.previousOperand = '';
          this.operation = undefined;
          this.justCalculated = true;
          this.updateDisplay();
          this.sound.playClick('equals');
          // Close history drawer on item select
          document.getElementById('history-panel').classList.remove('open');
        }
      });
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const previousOperandEl = document.getElementById('previous-operand');
  const currentOperandEl = document.getElementById('current-operand');
  const historyListEl = document.getElementById('history-list');
  const historyPanel = document.getElementById('history-panel');
  const historyToggleBtn = document.getElementById('history-toggle');
  const closeHistoryBtn = document.getElementById('close-history-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const soundToggleBtn = document.getElementById('sound-toggle');
  const displayContainer = document.getElementById('display-container');
  const toastEl = document.getElementById('copied-toast');

  const calculator = new Calculator(previousOperandEl, currentOperandEl, historyListEl);

  // 1. Button click events
  document.querySelectorAll('.btn').forEach((button) => {
    button.addEventListener('click', () => {
      const number = button.dataset.number;
      const operation = button.dataset.operation;
      const action = button.dataset.action;

      if (number !== undefined) {
        calculator.sound.playClick('number');
        calculator.appendNumber(number);
      } else if (operation !== undefined) {
        calculator.sound.playClick('operator');
        calculator.chooseOperation(operation);
      } else if (action !== undefined) {
        switch (action) {
          case 'clear-all':
            calculator.sound.playClick('default');
            calculator.clear();
            break;
          case 'delete':
            calculator.sound.playClick('default');
            calculator.delete();
            break;
          case 'percentage':
            calculator.sound.playClick('operator');
            calculator.percentage();
            break;
          case 'toggle-sign':
            calculator.sound.playClick('operator');
            calculator.toggleSign();
            break;
          case 'equals':
            calculator.sound.playClick('equals');
            calculator.compute(true);
            break;
        }
      }
    });
  });

  // 2. Physical keyboard support
  window.addEventListener('keydown', (e) => {
    // If user is holding Ctrl/Cmd/Alt, don't intercept standard shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let targetButton = null;

    if (e.key >= '0' && e.key <= '9') {
      targetButton = document.querySelector(`[data-number="${e.key}"]`);
      calculator.sound.playClick('number');
      calculator.appendNumber(e.key);
    } else if (e.key === '.') {
      targetButton = document.querySelector(`[data-number="."]`);
      calculator.sound.playClick('number');
      calculator.appendNumber('.');
    } else if (e.key === '+' || e.key === '-') {
      const opSymbol = e.key === '-' ? '−' : '+';
      targetButton = document.querySelector(`[data-operation="${opSymbol}"]`);
      calculator.sound.playClick('operator');
      calculator.chooseOperation(opSymbol);
    } else if (e.key === '*') {
      targetButton = document.querySelector(`[data-operation="×"]`);
      calculator.sound.playClick('operator');
      calculator.chooseOperation('×');
    } else if (e.key === '/') {
      e.preventDefault();
      targetButton = document.querySelector(`[data-operation="÷"]`);
      calculator.sound.playClick('operator');
      calculator.chooseOperation('÷');
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      targetButton = document.querySelector(`[data-action="equals"]`);
      calculator.sound.playClick('equals');
      calculator.compute(true);
    } else if (e.key === 'Backspace') {
      targetButton = document.querySelector(`[data-action="delete"]`);
      calculator.sound.playClick('default');
      calculator.delete();
    } else if (e.key === 'Escape') {
      targetButton = document.querySelector(`[data-action="clear-all"]`);
      calculator.sound.playClick('default');
      calculator.clear();
      historyPanel.classList.remove('open');
    } else if (e.key === '%') {
      targetButton = document.querySelector(`[data-action="percentage"]`);
      calculator.sound.playClick('operator');
      calculator.percentage();
    }

    // Add tactile pressed animation to keyboard-pressed button
    if (targetButton) {
      targetButton.classList.add('pressed');
      setTimeout(() => targetButton.classList.remove('pressed'), 120);
    }
  });

  // 3. History drawer toggle
  historyToggleBtn.addEventListener('click', () => {
    historyPanel.classList.toggle('open');
  });

  closeHistoryBtn.addEventListener('click', () => {
    historyPanel.classList.remove('open');
  });

  clearHistoryBtn.addEventListener('click', () => {
    calculator.clearHistory();
  });

  // 4. Sound toggle
  const soundOnIcon = soundToggleBtn.querySelector('.sound-on');
  const soundOffIcon = soundToggleBtn.querySelector('.sound-off');

  function updateSoundIcon(enabled) {
    if (enabled) {
      soundOnIcon.classList.remove('hidden');
      soundOffIcon.classList.add('hidden');
      soundToggleBtn.setAttribute('aria-label', 'Mute sounds');
    } else {
      soundOnIcon.classList.add('hidden');
      soundOffIcon.classList.remove('hidden');
      soundToggleBtn.setAttribute('aria-label', 'Enable sounds');
    }
  }
  updateSoundIcon(calculator.sound.enabled);

  soundToggleBtn.addEventListener('click', () => {
    const isEnabled = calculator.sound.toggle();
    updateSoundIcon(isEnabled);
    if (isEnabled) calculator.sound.playClick('number');
  });

  // 5. Theme toggle (Light / Dark)
  const html = document.documentElement;
  const moonIcon = themeToggleBtn.querySelector('.moon-icon');
  const sunIcon = themeToggleBtn.querySelector('.sun-icon');

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('calc_theme', theme);
    if (theme === 'light') {
      moonIcon.classList.add('hidden');
      sunIcon.classList.remove('hidden');
    } else {
      moonIcon.classList.remove('hidden');
      sunIcon.classList.add('hidden');
    }
  }

  const savedTheme = localStorage.getItem('calc_theme') || 'dark';
  setTheme(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });

  // 6. Click on display to copy
  displayContainer.addEventListener('click', async () => {
    const val = calculator.currentOperand;
    if (!val || val === 'Error' || val === 'Cannot divide by 0') return;

    try {
      await navigator.clipboard.writeText(val);
      toastEl.classList.add('show');
      setTimeout(() => {
        toastEl.classList.remove('show');
      }, 1500);
    } catch {
      // Fallback if clipboard API not permitted
    }
  });
});
