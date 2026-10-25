import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('reads events the way Spring writes them', () => {
    const parser = new SseParser();
    expect(parser.feed('id:7\nevent:game\ndata:{"a":1}\n\n')).toEqual([{ id: '7', type: 'game', data: '{"a":1}' }]);
  });

  it('completes events across pieces split anywhere, with any line ending', () => {
    const parser = new SseParser();
    const text = 'id: 1\r\nevent: snapshot\r\ndata: {"x":\r\ndata: 2}\r\n\r\n: a comment\n\nevent:heartbeat\rdata:{}\r\r';
    const messages = [...text].flatMap(character => parser.feed(character));

    expect(messages).toEqual([
      { id: '1', type: 'snapshot', data: '{"x":\n2}' },
      { id: '1', type: 'heartbeat', data: '{}' }
    ]);
  });

  it('ignores events without data and unknown fields, and keeps the last ID', () => {
    const parser = new SseParser();
    expect(parser.feed('event:nothing\n\nretry:100\nfoo:bar\ndata\n\n')).toEqual([{ type: 'message', data: '' }]);
    expect(parser.feed('id:9\n\ndata:x\n\n')).toEqual([{ id: '9', type: 'message', data: 'x' }]);
  });
});
