class Warning {
  constructor(msg) {
    this.message = msg;
    this.name = 'Warning';
  }

  toString() {
    return `${this.name}: ${this.message}`;
  }
}

export default Warning;
