import { Illustration } from '../immersive/Illustration';
import { Component, type ReactNode } from 'react';
import { Button } from './Button';
/** Avoids exposing component stacks or private conversation data in error screens. */
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <main className="mx-auto max-w-xl p-6 py-16"><section className="neo-panel p-6" role="alert"><Illustration kind="error"/><h1 className="text-2xl font-bold">This page could not be displayed</h1><p className="my-4 text-muted">Reload to try again. Your account and friendships remain available.</p><Button onClick={()=>window.location.reload()}>Reload page</Button><a href="/" className="ml-4 inline-block min-h-11 text-cyan">Return home</a></section></main>;
    return this.props.children;
  }
}
