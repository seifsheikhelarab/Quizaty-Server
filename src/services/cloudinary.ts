import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_NAME,
	api_key: process.env.CLOUDINARY_KEY,
	api_secret: process.env.CLOUDINARY_SECRET,
});

export const uploadToCloudinary = (fileBuffer: Buffer, mimetype: string = 'image/jpeg'): Promise<string> => {
	return new Promise((resolve, reject) => {
		const b64 = fileBuffer.toString('base64');
		const dataUri = `data:${mimetype};base64,${b64}`;

		cloudinary.uploader.upload(
			dataUri,
			{
				folder: 'quizzes',
				resource_type: 'auto',
			},
			(error, result) => {
				if (error) return reject(error);
				if (result) resolve(result.secure_url);
				else reject(new Error('Cloudinary upload failed with no result'));
			}
		);
	});
};

export default cloudinary;
