import { framer } from "framer-plugin";

export const storeLicenseKey = async (licenseKey: string) => {
    try {
        await framer.setPluginData("LICENSE", licenseKey);
        return true;
    } catch (error) {
        console.error("Failed to store license:", error);
        return false;
    }
};

export const getLicenseKey = async () => {
    try {
        const data = await framer.getPluginData("LICENSE");
        return data || null;
    } catch (error) {
        console.error("Failed to get license:", error);
        return false;
    }
};

export const removeLicenseKey = async () => {
    try {
        await framer.setPluginData("LICENSE", null);
        return true;
    } catch (error) {
        console.error("Failed to remove license:", error);
        return false;
    }
};
