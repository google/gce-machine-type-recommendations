# Introduction
This tutorial explains a cost-effective and serverless approach for automating the process of applying machine-type recommendations 
to specific GCE instances.

The key idea is to regularly check if GCE machine type recommendations are available and apply them to the Compute Engine instances(VMs) that have a specific label.

```
By automatically applying machine-type recommendations GCP customers can save money 
while also saving time for having to do this task manually for each GCE instance.
```

In this tutorial we will make use of the following GCP services:
- Cloud Scheduler
- Pub/Sub
- Cloud Functions (2nd generation)
- Google Compute Engine (GCE)

# Pre-requisites
Before you get started you : 
- You need a GCP project with billing enabled.

# How to use this solution


**1. Creating GCE instances if they don't already exist**

- You need to have at least one VM (or more) in your project that has machine-type recommendations shown in the UI. 

In this case choose the VMs for which you want to apply the machine-type recommendation automatically by labeling them (for example label:autosize=true). In the future, applying labels can be enforced during the creation of the VM instances through Infrastructure-as-Code (IaC).

- If you don't already have VMs with machine-type recommendations, you can create one or more small (oversized) VMs and let them run "idle" for a while until the machine-type recommendation(s) is visible in the UI.

- In our case, we will create two VMs test-instance-1 and test-instance-2 in the GCP zone us-central1-a and we will add a label **auto-size=true** to the test-instance-1.

```
gcloud compute instances create test-instance-1 --zone=us-central1-a --machine-type=e2-medium --labels=autosize=true 
```

```
gcloud compute instances create test-instance-2 --zone=us-central1-a --machine-type=e2-medium  
```
  
  You will need to let these instances run **idle** for a while until the machine-type recommendations. 
  
  
  
  **2. Create a Pub/Sub topic**

Create a Pub/Sub topic (e.g gce-sizing-recommendations-topic) as follow:
```
gcloud pubsub topics create gce-sizing-recommendations-topic
```
  
 **3. Create a Cloud Scheduler cron job** 
  
Create a cron job that will push a message to a Pub/Sub topic each time it is triggered.
  ```
  gcloud scheduler jobs create pubsub gce-recommendations-job \
    --location=us-central1 \
    --schedule="0 4 * * *" \
    --topic="gce-sizing-recommendations-topic" \
    --message-body=`{zone:"us-central1-a", label:"autosize=true"}`
    
      gcloud scheduler jobs create pubsub gce-recommendations-job \
    --location=us-central1 \
    --schedule="0 4 * * *" \
    --topic="gce-sizing-recommendations-topic" \
    --message-body="{zone:us-central1-a, labelKey:autosize, labelValue:true}"
  ```
The cron job created above will run on a once per day at 4:00am, and it has the following message body:
**{"zone":"us-central1-a", "label":"autosize=true"}**
You can change the schedule based on your own needs.

**4. Deploy the Cloud Function (2nd generation)**

- clone the code of this repo
- go to the main directory `cd gce-machine-type-recommendations/`
- deploy the Cloud Function as follow: 
```
gcloud functions deploy autosizingfct \
       --gen2 \
       --region=europe-west4 \
       --runtime=nodejs14 \
       --entry-point=applySizingRecommendationsFct \
       --trigger-topic=gce-sizing-recommendations-topic
```

**5. Testing the whole setup**

When machine-type recommendation(s) appears for your labeled VM instance in the GCP console, you can trigger the Cloud Scheduler job manually (or wait for it to be triggered on schedule) and check if the machine-type recommendation(s) gets applied automatically to all labeled VMs that are withing the GCP zone configured in the cron job message body.


# Important considerations

- This solution relies on the GCP machine type recommendations. The latter has a few limitations.
- The approach described above is meant to be used as-is and it has not been tested in a large GCP environment with a lot of VMs.
- It should not be used in a production environment.
- The scope of this solution is standalone VMs. For GCE instances in a managed instance group, we recommend following GCP best practices.
- Sometimes the GCP machine type recommendation may recommend using a custom machine type, we only use the standard machine type in this approach.


  
