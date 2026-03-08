import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_NAME,
	api_key: process.env.CLOUDINARY_KEY,
	api_secret: process.env.CLOUDINARY_SECRET,
});

export const uploadToCloudinary = (fileBuffer: Buffer): Promise<string> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
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

		uploadStream.end(fileBuffer);
	});
};

export default cloudinary;
