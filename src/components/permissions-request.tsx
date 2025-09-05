"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, Mic, MapPin, Contact, RotateCcw, BellRing, RefreshCw, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type PermissionStatus = "granted" | "denied" | "prompt" | "unavailable" | "unknown" | "default";

const PermissionsRequest = () => {
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>("unknown");
  const [microphoneStatus, setMicrophoneStatus] = useState<PermissionStatus>("unknown");
  const [contactsStatus, setContactsStatus] = useState<PermissionStatus>("unknown");
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>("unknown");
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>("unknown");
  const [isLoading, setIsLoading] = useState(false); // State for overall refresh button

  // Individual loading states for each permission request button
  const [isCameraRequesting, setIsCameraRequesting] = useState(false);
  const [isMicrophoneRequesting, setIsMicrophoneRequesting] = useState(false);
  const [isContactsRequesting, setIsContactsRequesting] = useState(false);
  const [isLocationRequesting, setIsLocationRequesting] = useState(false);
  const [isNotificationRequesting, setIsNotificationRequesting] = useState(false);

  const requestCameraPermission = useCallback(async () => {
    setIsCameraRequesting(true); // Start loading for camera
    if (!navigator.mediaDevices) {
      toast.error("MediaDevices API (camera) not supported in this browser.");
      setCameraStatus("unavailable");
      setIsCameraRequesting(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop stream immediately after getting access
      setCameraStatus("granted");
      toast.success("Camera access granted!");
    } catch (error: any) {
      setCameraStatus("denied");
      toast.error(`Camera access denied: ${error.message}`);
    } finally {
      setIsCameraRequesting(false); // End loading for camera
    }
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    setIsMicrophoneRequesting(true); // Start loading for microphone
    if (!navigator.mediaDevices) {
      toast.error("MediaDevices API (microphone) not supported in this browser.");
      setMicrophoneStatus("unavailable");
      setIsMicrophoneRequesting(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // Stop stream immediately after getting access
      setMicrophoneStatus("granted");
      toast.success("Microphone access granted!");
    } catch (error: any) {
      setMicrophoneStatus("denied");
      toast.error(`Microphone access denied: ${error.message}`);
    } finally {
      setIsMicrophoneRequesting(false); // End loading for microphone
    }
  }, []);

  const requestLocationPermission = useCallback(() => {
    setIsLocationRequesting(true); // Start loading for location
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported in this browser.");
      setLocationStatus("unavailable");
      setIsLocationRequesting(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus("granted");
        toast.success(`Location access granted! Lat: ${position.coords.latitude}, Lng: ${position.coords.longitude}`);
        setIsLocationRequesting(false); // End loading on success
      },
      (error) => {
        setLocationStatus("denied");
        toast.error(`Location access denied: ${error.message}`);
        setIsLocationRequesting(false); // End loading on error
      },
      { enableHighAccuracy: true }
    );
  }, []);

  const requestContactsPermission = useCallback(async () => {
    setIsContactsRequesting(true); // Start loading for contacts
    if (!("contacts" in navigator && "ContactsManager" in window)) {
      toast.error("Contacts API not supported in this browser.");
      setContactsStatus("unavailable");
      setIsContactsRequesting(false);
      return;
    }
    try {
      const properties = ["name", "email", "tel", "address"];
      const options = { multiple: true };
      // The select method opens a contact picker, it doesn't just grant background access.
      const contacts = await (navigator as any).contacts.select(properties, options);
      if (contacts.length > 0) {
        setContactsStatus("granted");
        toast.success(`Accessed ${contacts.length} contacts!`);
      } else {
        setContactsStatus("denied"); // User closed picker without selecting
        toast.info("No contacts selected or access denied.");
      }
    } catch (error: any) {
      setContactsStatus("denied");
      toast.error(`Contacts access denied: ${error.message}`);
    } finally {
      setIsContactsRequesting(false); // End loading for contacts
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    setIsNotificationRequesting(true); // Start loading for notifications
    if (!("Notification" in window)) {
      toast.error("Notifications API not supported in this browser.");
      setNotificationStatus("unavailable");
      setIsNotificationRequesting(false);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission);
      if (permission === "granted") {
        toast.success("Notification access granted!");
        // Example: show a test notification
        new Notification("Hello!", { body: "This is a test notification." });
      } else {
        toast.error(`Notification access ${permission}.`);
      }
    } catch (error: any) {
      setNotificationStatus("denied");
      toast.error(`Notification request failed: ${error.message}`);
    } finally {
      setIsNotificationRequesting(false); // End loading for notifications
    }
  }, []);

  const refreshAllPermissionsStatus = useCallback(async () => {
    setIsLoading(true); // Start loading for overall refresh
    try {
      if (!navigator.permissions) {
        setCameraStatus("unavailable");
        setMicrophoneStatus("unavailable");
        setContactsStatus("unavailable");
        setLocationStatus("unavailable");
        setNotificationStatus("unavailable");
        toast.error("Permission API not supported in this browser.");
        return;
      }

      // Camera
      try {
        const cameraPerm = await navigator.permissions.query({ name: "camera" as PermissionName });
        setCameraStatus(cameraPerm.state);
        cameraPerm.onchange = () => setCameraStatus(cameraPerm.state);
      } catch (error) {
        console.error("Error querying camera permission:", error);
        setCameraStatus("unavailable");
      }

      // Microphone
      try {
        const micPerm = await navigator.permissions.query({ name: "microphone" as PermissionName });
        setMicrophoneStatus(micPerm.state);
        micPerm.onchange = () => setMicrophoneStatus(micPerm.state);
      } catch (error) {
        console.error("Error querying microphone permission:", error);
        setMicrophoneStatus("unavailable");
      }

      // Geolocation
      try {
        const geoPerm = await navigator.permissions.query({ name: "geolocation" });
        setLocationStatus(geoPerm.state);
        geoPerm.onchange = () => setLocationStatus(geoPerm.state);
      } catch (error) {
        console.error("Error querying geolocation permission:", error);
        setLocationStatus("unavailable");
      }

      // Contacts (still manual, but check initial state)
      if ("contacts" in navigator && "ContactsManager" in window) {
        setContactsStatus("prompt"); // Assume prompt if API exists, actual request is via button
      } else {
        setContactsStatus("unavailable");
      }

      // Notifications
      if ("Notification" in window) {
        try {
          const notificationPerm = await navigator.permissions.query({ name: "notifications" as PermissionName });
          setNotificationStatus(notificationPerm.state);
          notificationPerm.onchange = () => setNotificationStatus(notificationPerm.state);
        } catch (error) {
          console.error("Error querying notification permission:", error);
          setNotificationStatus("unavailable");
        }
      } else {
        setNotificationStatus("unavailable");
      }
      toast.info("Permission statuses refreshed!");
    } finally {
      setIsLoading(false); // End loading for overall refresh
    }
  }, []);

  useEffect(() => {
    refreshAllPermissionsStatus();
  }, [refreshAllPermissionsStatus]);

  const getBadgeVariant = (status: PermissionStatus) => {
    switch (status) {
      case "granted":
        return "default";
      case "denied":
        return "destructive";
      case "prompt":
      case "default":
        return "secondary";
      case "unavailable":
        return "outline";
      case "unknown":
      default:
        return "outline";
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-8 max-w-3xl"> {/* Removed redundant min-h-screen and font styles */}
      <h1 className="text-3xl font-bold mb-8 text-center">Permission Requests</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Camera Access</CardTitle>
            <Camera className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              <Badge variant={getBadgeVariant(cameraStatus)}>{cameraStatus}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Allows the application to use your device's camera.
            </p>
            <Button
              onClick={requestCameraPermission}
              disabled={cameraStatus === "granted" || cameraStatus === "unavailable" || isCameraRequesting}
            >
              {isCameraRequesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Request Camera
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Microphone Access</CardTitle>
            <Mic className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              <Badge variant={getBadgeVariant(microphoneStatus)}>{microphoneStatus}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Allows the application to use your device's microphone.
            </p>
            <Button
              onClick={requestMicrophonePermission}
              disabled={microphoneStatus === "granted" || microphoneStatus === "unavailable" || isMicrophoneRequesting}
            >
              {isMicrophoneRequesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Request Microphone
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Contacts Access</CardTitle>
            <Contact className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              <Badge variant={getBadgeVariant(contactsStatus)}>{contactsStatus}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Allows the application to access your device's contacts. Note: This opens a picker.
            </p>
            <Button
              onClick={requestContactsPermission}
              disabled={contactsStatus === "unavailable" || isContactsRequesting}
            >
              {isContactsRequesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Contact className="mr-2 h-4 w-4" />
              )}
              Request Contacts
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Precise Location</CardTitle>
            <MapPin className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              <Badge variant={getBadgeVariant(locationStatus)}>{locationStatus}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Allows the application to access your precise geographical location.
            </p>
            <Button
              onClick={requestLocationPermission}
              disabled={locationStatus === "granted" || locationStatus === "unavailable" || isLocationRequesting}
            >
              {isLocationRequesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              Request Location
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Notification Access</CardTitle>
            <BellRing className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">
              <Badge variant={getBadgeVariant(notificationStatus)}>{notificationStatus}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Allows the application to send you notifications.
            </p>
            <Button
              onClick={requestNotificationPermission}
              disabled={notificationStatus === "granted" || notificationStatus === "unavailable" || isNotificationRequesting}
            >
              {isNotificationRequesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="mr-2 h-4 w-4" />
              )}
              Request Notifications
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-4 mt-4">
        <Button variant="outline" onClick={refreshAllPermissionsStatus} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Status
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Permissions
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>How to Reset Permissions</DialogTitle>
              <DialogDescription>
                To reset or change permissions for this site, you need to do it manually in your browser settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm">
              <p>
                <strong>For Chrome/Edge:</strong>
                <br />
                1. Click the lock icon (🔒) or information icon (ⓘ) next to the URL in the address bar.
                <br />
                2. Select "Site settings" or "Permissions".
                <br />
                3. Find the relevant permissions (Camera, Microphone, Location, Notifications, etc.) and change them to "Ask" or "Block".
              </p>
              <p>
                <strong>For Firefox:</strong>
                <br />
                1. Click the lock icon (🔒) next to the URL.
                <br />
                2. Click "Connection secure" then "More information".
                <br />
                3. Go to the "Permissions" tab and adjust settings.
              </p>
              <p>
                <strong>For Safari:</strong>
                <br />
                1. Go to Safari &gt; Settings (or Preferences).
                <br />
                2. Select the "Websites" tab.
                <br />
                3. Find this website in the list and adjust its permissions.
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Got it</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PermissionsRequest;