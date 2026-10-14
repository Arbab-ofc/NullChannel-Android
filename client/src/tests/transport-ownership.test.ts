import {it,expect,vi} from 'vitest';
const fake=vi.hoisted(()=>({on:vi.fn(),disconnect:vi.fn(),connect:vi.fn(),auth:{}}));
vi.mock('socket.io-client',()=>({io:()=>fake}));
import {socket,retainTransport,releaseTransport} from '../lib/socket';
it('keeps a transport alive for a call after page release and releases the final owner exactly once',()=>{retainTransport(socket,'page');retainTransport(socket,'call');retainTransport(socket,'call');releaseTransport(socket,'page');expect(fake.disconnect).not.toHaveBeenCalled();releaseTransport(socket,'call');expect(fake.disconnect).toHaveBeenCalledOnce();releaseTransport(socket,'call');expect(fake.disconnect).toHaveBeenCalledOnce();});
