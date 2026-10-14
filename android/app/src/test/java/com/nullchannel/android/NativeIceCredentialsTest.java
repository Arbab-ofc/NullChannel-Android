package com.nullchannel.android;

import static org.junit.Assert.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class NativeIceCredentialsTest {
    private JSONObject config(long expires,String password)throws Exception {
        return new JSONObject().put("expiresAt",expires).put("iceServers",new JSONArray().put(
            new JSONObject().put("urls",new JSONArray().put("turn:fixture.invalid:3478?transport=udp").put("turns:fixture.invalid:5349?transport=tcp"))
                .put("username","fixture-user").put("credential",password)));
    }

    @Test public void expiredReceiverLeaseRefreshesWhileHealthyLeaseIsReused()throws Exception {
        AtomicLong now=new AtomicLong(0);AtomicInteger requests=new AtomicInteger();
        NativeIceCredentials lease=new NativeIceCredentials(now::get,()->{
            try{return CompletableFuture.completedFuture(config(60+now.get()/1000,"fixture-"+requests.incrementAndGet()));}
            catch(Exception error){throw new IllegalStateException(error);}
        });
        assertEquals("fixture-1",lease.fresh().get().getJSONObject(0).getString("credential"));
        now.set(10000);lease.fresh().get();assertEquals(1,requests.get());
        now.set(61000);assertEquals("fixture-2",lease.fresh().get().getJSONObject(0).getString("credential"));
        assertEquals(2,requests.get());lease.close();
    }

    @Test public void concurrentRequestsShareOneRefresh()throws Exception {
        CompletableFuture<JSONObject> response=new CompletableFuture<>();AtomicInteger requests=new AtomicInteger();
        NativeIceCredentials lease=new NativeIceCredentials(()->0,()->{requests.incrementAndGet();return response;});
        ExecutorService callers=Executors.newFixedThreadPool(4);
        try{
            java.util.List<Future<CompletableFuture<JSONArray>>> results=new java.util.ArrayList<>();
            for(int i=0;i<8;i++)results.add(callers.submit(lease::fresh));
            CompletableFuture<JSONArray> first=results.get(0).get();
            for(Future<CompletableFuture<JSONArray>> result:results)assertSame(first,result.get());
            assertEquals(1,requests.get());response.complete(config(60,"fixture"));assertEquals(2,first.get().length());
        }finally{lease.close();callers.shutdownNow();}
    }

    @Test public void failureDoesNotReturnExpiredCredentialsAndAllowsNewAttempt()throws Exception {
        AtomicLong now=new AtomicLong(0);AtomicInteger requests=new AtomicInteger();
        NativeIceCredentials lease=new NativeIceCredentials(now::get,()->{
            if(requests.incrementAndGet()==2){CompletableFuture<JSONObject> result=new CompletableFuture<>();result.completeExceptionally(new java.io.IOException("fixture failure"));return result;}
            try{return CompletableFuture.completedFuture(config(60+now.get()/1000,"fixture"));}catch(Exception error){throw new IllegalStateException(error);}
        });
        lease.fresh().get();now.set(61000);
        try{lease.fresh().get();fail("Expired credentials reused");}catch(ExecutionException expected){assertTrue(expected.getCause() instanceof java.io.IOException);}
        lease.fresh().get();assertEquals(3,requests.get());lease.close();
    }

    @Test public void cancelledOwnerDiscardsEvenUncancellableLateResponse()throws Exception {
        CompletableFuture<JSONObject> response=new CompletableFuture<JSONObject>(){@Override public boolean cancel(boolean interrupt){return false;}};
        NativeIceCredentials lease=new NativeIceCredentials(()->0,()->response);
        CompletableFuture<JSONArray> pending=lease.fresh();lease.close();response.complete(config(60,"fixture"));
        assertTrue(pending.isCancelled());try{lease.fresh().get();fail("Closed owner returned credentials");}catch(ExecutionException expected){assertEquals("Call ended",expected.getCause().getMessage());}
    }

    @Test public void stunCoexistsWithTurnWithoutMutatingRelayConfiguration()throws Exception {
        JSONArray relay=config(60,"fixture-secret").getJSONArray("iceServers");
        JSONArray combined=NativeIceCredentials.withStun(relay);
        assertEquals(1,relay.length());assertEquals(2,combined.length());
        assertEquals(relay.getJSONObject(0).toString(),combined.getJSONObject(0).toString());
        assertEquals(NativeIceCredentials.PUBLIC_STUN,combined.getJSONObject(1).getString("urls"));
        assertEquals(2,NativeIceCredentials.withStun(combined).length());
    }

    @Test public void alreadyExpiredServerResponseIsRejected()throws Exception {
        JSONObject expired=config(0,"fixture");NativeIceCredentials lease=new NativeIceCredentials(()->1000,()->CompletableFuture.completedFuture(expired));
        try{lease.fresh().get();fail("Expired response accepted");}catch(ExecutionException expected){assertEquals("Invalid ICE configuration",expected.getCause().getMessage());}finally{lease.close();}
    }
}
