package com.nullchannel.android;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
/** Deferred token rotation reads the encrypted vault, never WorkManager input data. */
public final class PushTokenWorker extends Worker {
  static final String NAME="nullchannel-fcm-token-rotation";
  public PushTokenWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
  static void schedule(Context context){OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(PushTokenWorker.class).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,10,java.util.concurrent.TimeUnit.SECONDS).build();WorkManager.getInstance(context).enqueueUniqueWork(NAME,ExistingWorkPolicy.REPLACE,work);}
  @NonNull @Override public Result doWork(){String token=NativeVault.get(getApplicationContext(),"fcm.token");if(token==null||isStopped())return Result.success();boolean rotated=NativePushApi.rotate(getApplicationContext(),token);return rotated?Result.success():getRunAttemptCount()<5?Result.retry():Result.failure();}
}
